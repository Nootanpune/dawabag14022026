// NOTE (2026-09-30, docs/DECISIONS.md): marketplace partners are the seller of
// record and invoice the customer themselves. The allocation and settlement code
// below predates that decision; Sprint 3 must rework settlement around
// partner-issued invoices, Dawabag commission invoices and TCS/TDS.
// src/services/vendor.service.ts — v2.0
// Fixes: GAP-03 (vendor approval workflow), GAP-04 (vendor rating system),
//        GAP-12 (vendor pincode for distance allocation)

import { pool } from '../config/database';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';

// ── Vendor Approval ───────────────────────────────────────────────────────────
export class VendorApprovalService {

  static async approveVendor(params: {
    vendorId: string;
    adminId: string;
    drugLicenseType: 'dl20' | 'dl21' | 'dl20b' | 'dl21b';
    drugLicenseExpiry: string; // YYYY-MM-DD
    vendorType: 'supplier' | 'marketplace_partner' | 'both';
    notes?: string;
  }): Promise<void> {
    const { vendorId, adminId, drugLicenseType, drugLicenseExpiry, vendorType } = params;

    const result = await pool.query(
      `UPDATE vendors SET
         approval_status      = 'approved',
         kyc_status           = 'approved',
         drug_license_type    = $1,
         drug_license_expiry  = $2,
         drug_license_verified = TRUE,
         vendor_type          = $3,
         approved_by          = $4,
         approved_at          = NOW(),
         is_active            = TRUE,
         updated_at           = NOW()
       WHERE id = $5
       RETURNING name, contact_mobile, contact_email`,
      [drugLicenseType, drugLicenseExpiry, vendorType, adminId, vendorId]
    );

    if (!result.rows[0]) throw new AppError('Vendor not found', 404);

    // Log to audit trail
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, new_value, performed_by)
       VALUES ($1, 'vendor_approved', $2, $3)`,
      [adminId, JSON.stringify({ vendor_id: vendorId, vendor_type: vendorType,
        dl_type: drugLicenseType, dl_expiry: drugLicenseExpiry }), adminId]
    );

    logger.info(`Vendor ${vendorId} approved by admin ${adminId}`);
  }

  static async rejectVendor(params: {
    vendorId: string;
    adminId: string;
    rejectionReason: string;
  }): Promise<void> {
    await pool.query(
      `UPDATE vendors SET
         approval_status   = 'rejected',
         kyc_status        = 'rejected',
         rejection_reason  = $1,
         approved_by       = $2,
         approved_at       = NOW(),
         is_active         = FALSE,
         updated_at        = NOW()
       WHERE id = $3`,
      [params.rejectionReason, params.adminId, params.vendorId]
    );

    await pool.query(
      `INSERT INTO audit_logs (user_id, action, new_value, performed_by)
       VALUES ($1, 'vendor_rejected', $2, $3)`,
      [params.adminId, JSON.stringify({ vendor_id: params.vendorId,
        reason: params.rejectionReason }), params.adminId]
    );

    logger.info(`Vendor ${params.vendorId} rejected by admin ${params.adminId}`);
  }

  static async getPendingVendors(): Promise<any[]> {
    const result = await pool.query(
      `SELECT v.id, v.name, v.drug_license_no, v.gst_number, v.contact_name,
              v.contact_mobile, v.contact_email, v.vendor_type,
              v.pincode, v.city, v.state, v.created_at,
              -- Drug license portal link
              CASE
                WHEN v.pincode LIKE '40%' OR v.pincode LIKE '41%' OR v.pincode LIKE '42%'
                  THEN 'https://fda.maharashtra.gov.in/'
                WHEN v.pincode LIKE '56%' OR v.pincode LIKE '57%'
                  THEN 'https://ahvs.karnataka.gov.in/'
                ELSE 'https://www.cdsco.gov.in/opencms/opencms/en/DrugLicence/'
              END AS dl_portal_url
       FROM vendors v
       WHERE v.approval_status = 'pending'
       ORDER BY v.created_at ASC`
    );
    return result.rows;
  }
}

// ── Vendor Rating Engine ──────────────────────────────────────────────────────
export class VendorRatingService {

  // Called after each order is delivered or returned — updates running metrics
  static async recordOrderFulfilment(params: {
    vendorId: string;
    orderId: string;
    wasOnTime: boolean;
    wasReturned: boolean;
    dispatchHours: number; // hours from order to dispatch
  }): Promise<void> {
    const { vendorId, wasOnTime, wasReturned, dispatchHours } = params;

    // Update rolling vendor stats
    await pool.query(
      `UPDATE vendors SET
         total_orders_received    = total_orders_received + 1,
         total_orders_fulfilled   = total_orders_fulfilled + CASE WHEN $2 THEN 0 ELSE 1 END,
         -- Recalculate on_time_dispatch_pct (rolling average — simplified)
         on_time_dispatch_pct     = CASE
           WHEN total_orders_received = 0 THEN 100.0
           ELSE ROUND(
             (on_time_dispatch_pct * total_orders_received + CASE WHEN $3 THEN 100.0 ELSE 0.0 END)
             / (total_orders_received + 1), 2)
           END,
         return_rate_pct          = CASE
           WHEN total_orders_received = 0 THEN 0.0
           ELSE ROUND(
             (return_rate_pct * total_orders_received + CASE WHEN $4 THEN 100.0 ELSE 0.0 END)
             / (total_orders_received + 1), 2)
           END,
         avg_dispatch_hours       = CASE
           WHEN total_orders_received = 0 THEN $5
           ELSE ROUND(
             (avg_dispatch_hours * total_orders_received + $5)
             / (total_orders_received + 1), 1)
           END,
         last_rating_updated_at   = NOW(),
         updated_at               = NOW()
       WHERE id = $1`,
      [vendorId, wasReturned, wasOnTime, wasReturned, dispatchHours]
    );

    // Recalculate composite rating score
    await VendorRatingService.recalculateRating(vendorId);
  }

  // Composite rating formula (5-star scale):
  // - Fulfilment rate: 40% weight
  // - On-time dispatch: 35% weight
  // - Low return rate: 25% weight
  static async recalculateRating(vendorId: string): Promise<void> {
    const result = await pool.query(
      `SELECT total_orders_received, total_orders_fulfilled,
              on_time_dispatch_pct, return_rate_pct
       FROM vendors WHERE id = $1`,
      [vendorId]
    );

    if (!result.rows[0]) return;
    const v = result.rows[0];

    const fulfilmentRate = v.total_orders_received > 0
      ? (v.total_orders_fulfilled / v.total_orders_received) * 100
      : 100;

    // Composite score (each component normalised to 0-5 scale)
    const ratingScore = Math.min(5.0, Math.max(0.0,
      (fulfilmentRate / 100)            * 5 * 0.40 +  // Fulfilment rate: 40%
      (v.on_time_dispatch_pct / 100)    * 5 * 0.35 +  // On-time dispatch: 35%
      ((100 - v.return_rate_pct) / 100) * 5 * 0.25    // Low return rate: 25%
    ));

    await pool.query(
      'UPDATE vendors SET vendor_rating = $1 WHERE id = $2',
      [Math.round(ratingScore * 100) / 100, vendorId]
    );

    logger.debug(`Vendor ${vendorId} rating updated to ${ratingScore.toFixed(2)}`);
  }

  // Monthly performance snapshot (for historical trending)
  static async recordMonthlySnapshot(vendorId: string): Promise<void> {
    const result = await pool.query(
      `SELECT total_orders_received, total_orders_fulfilled, on_time_dispatch_pct,
              return_rate_pct, avg_dispatch_hours, vendor_rating
       FROM vendors WHERE id = $1`,
      [vendorId]
    );
    if (!result.rows[0]) return;
    const v = result.rows[0];

    await pool.query(
      `INSERT INTO vendor_performance_history
         (vendor_id, period_month, orders_received, orders_fulfilled,
          avg_dispatch_hrs, calculated_rating)
       VALUES ($1, DATE_TRUNC('month', CURRENT_DATE), $2, $3, $4, $5)
       ON CONFLICT (vendor_id, period_month) DO UPDATE SET
         orders_received  = EXCLUDED.orders_received,
         orders_fulfilled = EXCLUDED.orders_fulfilled,
         avg_dispatch_hrs = EXCLUDED.avg_dispatch_hrs,
         calculated_rating = EXCLUDED.calculated_rating`,
      [vendorId, v.total_orders_received, v.total_orders_fulfilled,
       v.avg_dispatch_hours, v.vendor_rating]
    );
  }
}

// ── Partner Order Allocation ──────────────────────────────────────────────────
// GAP-04 fix: implements the 5-step allocation algorithm from URS
export class PartnerAllocationService {

  static async allocateOrder(params: {
    productId: string;
    quantity: number;
    customerPincode: string;
  }): Promise<{
    partnerId: string;
    partnerName: string;
    partnerProductId: string;
    inventoryId: string;
    supplyPricePaise: number;
    allocationReason: string;
  } | null> {
    const { productId, quantity, customerPincode } = params;

    // Query all eligible partner-inventory combinations for this product
    // Ordered by the 5-step allocation algorithm:
    // 1. Stock availability (filter)
    // 2. Nearest pincode (by numeric proximity — simplified; use PostGIS for real geo)
    // 3. Partner rating (desc)
    // 4. Supply price (asc)
    // 5. FEFO (nearest expiry first — within a partner)
    const result = await pool.query(
      `SELECT
         v.id AS partner_id,
         v.name AS partner_name,
         v.pincode AS partner_pincode,
         v.vendor_rating,
         v.on_time_dispatch_pct,
         pp.id AS partner_product_id,
         pp.supply_price_paise,
         pi.id AS inventory_id,
         pi.qty_available - pi.qty_reserved AS available_qty,
         pi.expiry_date,
         -- Distance approximation: absolute difference of pincodes
         -- In production: use PostGIS ST_Distance(v.location, customer_location)
         ABS(v.pincode::INTEGER - $3::INTEGER) AS pincode_distance
       FROM vendors v
       JOIN partner_products pp ON pp.partner_id = v.id
         AND pp.product_id = $1
         AND pp.listing_status = 'live'
         AND pp.approval_status = 'approved'
       JOIN partner_inventory pi ON pi.partner_product_id = pp.id
         AND pi.qty_available - pi.qty_reserved >= $2
         AND pi.expiry_date > CURRENT_DATE + INTERVAL '180 days'
         AND ($4 = FALSE OR pi.cold_chain_confirmed = TRUE)
       WHERE v.approval_status = 'approved'
         AND v.is_active = TRUE
         AND v.vendor_type IN ('marketplace_partner','both')
       ORDER BY
         pincode_distance ASC,     -- Nearest partner first
         v.vendor_rating DESC,     -- Highest rating second
         pp.supply_price_paise ASC, -- Lowest price third
         pi.expiry_date ASC        -- FEFO last (within a partner)
       LIMIT 1`,
      [productId, quantity, customerPincode, false /* cold_chain_required */]
    );

    if (!result.rows[0]) return null;

    const partner = result.rows[0];
    const reason  = [
      `Nearest partner (pincode diff: ${partner.pincode_distance})`,
      `Rating: ${partner.vendor_rating}/5`,
      `Supply price: ₹${Math.round(partner.supply_price_paise/100)}`,
      `Stock: ${partner.available_qty} units`,
      `Expiry: ${partner.expiry_date}`,
    ].join(', ');

    return {
      partnerId:         partner.partner_id,
      partnerName:       partner.partner_name,
      partnerProductId:  partner.partner_product_id,
      inventoryId:       partner.inventory_id,
      supplyPricePaise:  partner.supply_price_paise,
      allocationReason:  reason,
    };
  }

  // Reserve partner inventory for an order item
  static async reservePartnerInventory(params: {
    orderId: string;
    orderItemId: string;
    partnerId: string;
    partnerProductId: string;
    inventoryId: string;
    quantity: number;
    supplyPricePaise: number;
    allocationReason: string;
  }): Promise<void> {
    const {
      orderId, orderItemId, partnerId, partnerProductId,
      inventoryId, quantity, supplyPricePaise, allocationReason
    } = params;

    // Get commission rate for this partner
    const commResult = await pool.query(
      `SELECT commission_pct, finding_fee_paise
       FROM partner_commission_rates WHERE partner_id = $1`,
      [partnerId]
    );
    const commRate      = commResult.rows[0]?.commission_pct || 8.0;
    const findingFee    = commResult.rows[0]?.finding_fee_paise || 1500;
    const commissionAmt = Math.round(supplyPricePaise * quantity * commRate / 100);
    const netPayable    = (supplyPricePaise * quantity) - commissionAmt - findingFee;

    await pool.query('BEGIN');
    try {
      // Reserve inventory
      await pool.query(
        `UPDATE partner_inventory
         SET qty_reserved = qty_reserved + $1, last_updated_at = NOW()
         WHERE id = $2 AND qty_available - qty_reserved >= $1`,
        [quantity, inventoryId]
      );

      // Create partner order item record
      await pool.query(
        `INSERT INTO partner_order_items
           (order_id, order_item_id, partner_id, partner_product_id,
            partner_inv_id, allocated_qty, supply_price_paise,
            commission_pct, commission_paise, finding_fee_paise,
            net_payable_paise, allocation_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          orderId, orderItemId, partnerId, partnerProductId,
          inventoryId, quantity, supplyPricePaise,
          commRate, commissionAmt, findingFee,
          netPayable, allocationReason
        ]
      );

      await pool.query('COMMIT');
      logger.info(`Order ${orderId} item allocated to partner ${partnerId}`);
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  }
}

// ── Low stock alert checker ───────────────────────────────────────────────────
// GAP-08 fix: daily cron to check all products and alert admin
export interface LowStockAlert { id: string; name: string; sku: string; current_stock: number; reorder_level_qty: number }

// Records one alert per product per day; returns the products newly alerted
// today so the scheduled job can send the admin digest.
export async function checkLowStockAndAlert(): Promise<{ flagged: number; newAlerts: LowStockAlert[] }> {
  const lowStockProducts = await pool.query(
    `SELECT p.id, p.name, p.sku, p.reorder_level_qty,
            COALESCE(SUM(b.quantity_available - b.quantity_reserved), 0) AS current_stock,
            p.preferred_vendor_id
     FROM products p
     LEFT JOIN inventory_batches b ON b.product_id = p.id
       AND b.expiry_date > CURRENT_DATE + 30
     WHERE p.is_active = TRUE AND p.deleted_at IS NULL
       AND p.reorder_level_qty > 0
     GROUP BY p.id
     HAVING COALESCE(SUM(b.quantity_available - b.quantity_reserved), 0) <= p.reorder_level_qty`
  );

  const newAlerts: LowStockAlert[] = [];
  for (const product of lowStockProducts.rows) {
    // Check if alert was already sent today
    const existing = await pool.query(
      `SELECT id FROM low_stock_alerts
       WHERE product_id = $1 AND alert_date = CURRENT_DATE`,
      [product.id]
    );
    if (existing.rows[0]) continue; // Already alerted today

    await pool.query(
      `INSERT INTO low_stock_alerts (product_id, current_qty, reorder_level)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [product.id, product.current_stock, product.reorder_level_qty]
    );

    logger.warn(
      `LOW STOCK: ${product.name} (${product.sku}) — ` +
      `Current: ${product.current_stock}, Reorder level: ${product.reorder_level_qty}`
    );

    newAlerts.push({ ...product, current_stock: Number(product.current_stock) });
  }

  logger.info(`Low stock check complete: ${lowStockProducts.rows.length} products flagged`);
  return { flagged: lowStockProducts.rows.length, newAlerts };
}
