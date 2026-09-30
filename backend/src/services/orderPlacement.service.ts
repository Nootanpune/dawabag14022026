// src/services/orderPlacement.service.ts
// Places an order for a buyer — used by POST /orders and by the refill job, so
// both apply identical rules: KYC gate, prices for the buyer's type, quantity
// limits, prescription flags, allocation to sellers, coupon, wallet, credit.
import { PoolClient } from 'pg';
import { z } from 'zod';
import { withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { generateOrderNumber } from '../utils/helpers';
import { queueNotification } from './notification.service';
import { TRADE_TYPES, BuyerType, allowsCreditTerms, isBuyerType, priceField, requiresPrescription } from '../utils/customerType';
import { evaluateCoupon } from './coupon.service';
import { Allocation, allocateAndReserve } from './allocation.service';
import { createShipmentsAndLines } from './shipment.service';

export const createOrderSchema = z.object({
  patient_id:           z.string().uuid().optional(),
  address_id:           z.string().uuid(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity:   z.number().int().min(1),
  })).min(1),
  coupon_code:          z.string().optional(),
  wallet_amount_paise:  z.number().int().min(0).optional().default(0),
  pincode:              z.string().length(6),
  payment_terms:        z.enum(['prepaid','cad','net_7','net_15','net_30','net_45','net_60','postpaid'])
                         .optional().default('prepaid'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export interface OrderBuyer {
  id: string;
  pricing_type: BuyerType;
  customer_type: string;
  kyc_status: string | null;
}

export interface PlaceOrderOptions {
  ip?: string | null;
  refill?: { subscriptionId: string; forDate: string };
}

export async function placeOrder(buyer: OrderBuyer, data: CreateOrderInput, opts: PlaceOrderOptions = {}) {
  const userId       = buyer.id;
  const customerType = buyer.pricing_type;
  const isB2B        = allowsCreditTerms(customerType);
  const priceColumn  = priceField(customerType);

  // Trade accounts cannot order until admin approves their KYC (URS v3.1 §2)
  const registeredType = buyer.customer_type;
  if (isBuyerType(registeredType) && TRADE_TYPES.includes(registeredType) && buyer.kyc_status !== 'approved') {
    throw new AppError('Your business account is awaiting KYC approval. Orders open once our team verifies your documents.', 403);
  }

  // Validate payment terms against customer type
  if (!isB2B && data.payment_terms !== 'prepaid') {
    throw new AppError('Credit and CAD terms are only available for B2B accounts', 400);
  }

  const order = await withTransaction(async (client) => {
    let subtotalPaise = 0;
    let gstPaise      = 0;
    let discountPaise = 0;
    let hasScheduleH  = false;
    const lineItems: any[] = [];

    for (const item of data.items) {
      const res = await client.query(
        `SELECT p.id, p.name, p.sku, p.drug_schedule, p.gst_rate,
                p.mrp_paise, p.offer_price_paise,
                COALESCE(p.ptr_price_paise, p.offer_price_paise) AS ptr_price_paise,
                COALESCE(p.pts_price_paise, p.offer_price_paise) AS pts_price_paise,
                COALESCE(p.institutional_price_paise, p.offer_price_paise) AS institutional_price_paise,
                p.max_qty_per_order,
                COALESCE(p.min_order_qty_retailer, 1) AS min_order_qty_retailer,
                COALESCE(p.min_order_qty_wholesaler, 10) AS min_order_qty_wholesaler,
                COALESCE(p.max_qty_per_order_retailer, 9999) AS max_qty_per_order_retailer,
                COALESCE(p.max_qty_per_order_wholesaler, 9999) AS max_qty_per_order_wholesaler,
                p.is_active, p.cold_chain,
                COALESCE(p.reorder_level_qty, 10) AS reorder_level_qty
         FROM products p
         WHERE p.id = $1 AND p.is_active = TRUE AND p.deleted_at IS NULL`,
        [item.product_id]
      );
      const prod = res.rows[0];
      if (!prod) throw new AppError(`Product not found: ${item.product_id}`, 404);

      // Hard block NDPS/Schedule X
      if (['NDPS', 'Schedule X'].includes(prod.drug_schedule)) {
        throw new AppError(`${prod.name} cannot be ordered online`, 403);
      }

      if (['Schedule H', 'Schedule H1'].includes(prod.drug_schedule)) {
        if (requiresPrescription(customerType, prod.drug_schedule)) {
          hasScheduleH = true;
        }
      }

      // Min/max quantity enforcement
      let minQty = 1;
      let maxQty = prod.max_qty_per_order;
      if (customerType === 'b2b_retailer') {
        minQty = prod.min_order_qty_retailer;
        maxQty = prod.max_qty_per_order_retailer;
      } else if (customerType === 'b2b_wholesaler') {
        minQty = prod.min_order_qty_wholesaler;
        maxQty = prod.max_qty_per_order_wholesaler;
      }

      if (item.quantity < minQty) {
        throw new AppError(`Minimum order for ${prod.name} is ${minQty} units`, 400);
      }
      if (item.quantity > maxQty) {
        throw new AppError(`Maximum order for ${prod.name} is ${maxQty} units`, 400);
      }

      // Price selection based on customer type
      const unitPricePaise: number = prod[priceColumn] || prod.offer_price_paise;
      const assessable = unitPricePaise * item.quantity;
      const gstAmt     = Math.round(assessable * prod.gst_rate / 100);
      subtotalPaise   += assessable;
      gstPaise        += gstAmt;

      lineItems.push({
        product_id: item.product_id,
        product_name: prod.name, sku: prod.sku,
        cold_chain: prod.cold_chain, reorder_level_qty: prod.reorder_level_qty,
        quantity: item.quantity, unit_price_paise: unitPricePaise,
        mrp_paise: prod.mrp_paise, gst_rate: prod.gst_rate,
        gst_amount_paise: gstAmt, assessable_paise: assessable,
        drug_schedule: prod.drug_schedule,
        line_total_paise: assessable + gstAmt,
      });
    }

    // Seller per line (Dawabag or partner) + stock reservation — services/allocation.service.ts
    const allocations = await allocateAndReserve(client, {
      lines: lineItems.map((li) => ({
        product_id: li.product_id, product_name: li.product_name,
        quantity: li.quantity, cold_chain: li.cold_chain,
      })),
      orderValuePaise: subtotalPaise + gstPaise,
      pincode: data.pincode,
    });
    await recordLowStock(client, lineItems, allocations);

    // Coupon — shared rules with the cart preview (services/coupon.service.ts)
    let couponId: string | null = null;
    if (data.coupon_code) {
      const coupon = await evaluateCoupon(client, data.coupon_code, lineItems.map((li) => ({
        drug_schedule: li.drug_schedule, line_subtotal_paise: li.assessable_paise,
      })));
      discountPaise = coupon.discountPaise;
      couponId = coupon.couponId;
      await client.query('UPDATE coupons SET uses_count = uses_count + 1 WHERE id = $1', [couponId]);
    }

    // Shipping — free for B2B orders above Rs.5000
    const pincodeRes = await client.query(
      'SELECT shipping_charge_paise FROM pincode_serviceability WHERE pincode = $1',
      [data.pincode]
    );
    let shippingPaise = pincodeRes.rows[0]?.shipping_charge_paise ?? 4900;
    if (isB2B && subtotalPaise >= 500000) shippingPaise = 0;

    // Wallet
    let walletUsedPaise = 0;
    if (data.payment_terms === 'prepaid' && data.wallet_amount_paise > 0) {
      const profile = await client.query(
        'SELECT wallet_balance_paise FROM user_profiles WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
      walletUsedPaise = Math.min(data.wallet_amount_paise, profile.rows[0]?.wallet_balance_paise ?? 0);
      if (walletUsedPaise > 0) {
        await client.query(
          'UPDATE user_profiles SET wallet_balance_paise = wallet_balance_paise - $1 WHERE user_id = $2',
          [walletUsedPaise, userId]
        );
      }
    }

    const totalPaise = Math.max(0, subtotalPaise + gstPaise + shippingPaise - discountPaise - walletUsedPaise);

    // Credit limit check
    if (['net_7','net_15','net_30','net_45','net_60','postpaid'].includes(data.payment_terms)) {
      const credit = await client.query(
        'SELECT credit_limit_paise, credit_used_paise FROM users WHERE id = $1 FOR UPDATE',
        [userId]
      );
      const { credit_limit_paise, credit_used_paise } = credit.rows[0];
      if ((credit_used_paise + totalPaise) > credit_limit_paise) {
        throw new AppError(
          `Order exceeds credit limit. Available: ₹${Math.round((credit_limit_paise - credit_used_paise)/100)}`, 400
        );
      }
      await client.query(
        'UPDATE users SET credit_used_paise = credit_used_paise + $1 WHERE id = $2',
        [totalPaise, userId]
      );
    }

    // Credit due date
    const creditDaysMap: Record<string, number> = { net_7:7, net_15:15, net_30:30, net_45:45, net_60:60 };
    let creditDueDate = null;
    if (creditDaysMap[data.payment_terms]) {
      creditDueDate = new Date();
      creditDueDate.setDate(creditDueDate.getDate() + creditDaysMap[data.payment_terms]);
    }

    // Buyer GSTIN/PAN for invoice
    const buyerRow = await client.query('SELECT gstin, pan_number, drug_license_number FROM users WHERE id = $1', [userId]);
    const buyerGstin = buyerRow.rows[0]?.gstin || null;

    const orderStatus = data.payment_terms === 'prepaid' ? 'pending_payment' : 'confirmed';
    const orderNumber = generateOrderNumber();

    const newOrder = await client.query(
      `INSERT INTO orders (
         order_number, invoice_number, user_id, patient_id, address_id,
         status, payment_terms, credit_due_date,
         subtotal_paise, discount_paise, shipping_paise, gst_paise,
         total_paise, coupon_id, wallet_used_paise,
         buyer_gstin, buyer_pan, e_invoice_status, buyer_drug_license,
         refill_subscription_id, refill_for_date
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING id, order_number, invoice_number`,
      [
        orderNumber, null,   // Dawabag's invoice number is set below if Dawabag ships a line
        userId, data.patient_id||null, data.address_id,
        orderStatus, data.payment_terms, creditDueDate,
        subtotalPaise, discountPaise, shippingPaise, gstPaise,
        totalPaise, couponId, walletUsedPaise,
        buyerGstin, buyerRow.rows[0]?.pan_number||null,
        buyerGstin ? 'pending' : 'not_applicable',
        // Licensed trade buyers only (Rulebook C-13)
        isBuyerType(registeredType) && TRADE_TYPES.includes(registeredType)
          ? buyerRow.rows[0]?.drug_license_number || null : null,
        opts.refill?.subscriptionId ?? null, opts.refill?.forDate ?? null,
      ]
    );
    const orderId = newOrder.rows[0].id;

    // One shipment + invoice per seller of record; lines attached to their shipment
    const shipments = await createShipmentsAndLines(client, orderId, lineItems, allocations);
    const invoiceNumber = shipments.find((sh) => sh.seller_type === 'dawabag')?.invoice_number ?? null;
    if (invoiceNumber) {
      await client.query('UPDATE orders SET invoice_number = $1 WHERE id = $2', [invoiceNumber, orderId]);
    }

    // Audit log
    await client.query(
      `INSERT INTO audit_logs (user_id, action, new_value, ip_address)
       VALUES ($1,'order_created',$2,$3)`,
      [userId, JSON.stringify({
        order_id: orderId, order_number: orderNumber,
        customer_type: customerType, payment_terms: data.payment_terms,
        total_paise: totalPaise
      }), opts.ip ?? null]
    );

    // Ordered lines leave the server-side cart in the same transaction
    await client.query(
      'DELETE FROM cart_items WHERE user_id = $1 AND product_id = ANY($2::uuid[])',
      [userId, data.items.map((i) => i.product_id)]
    );
    if (data.coupon_code) {
      await client.query('UPDATE carts SET coupon_code = NULL, updated_at = NOW() WHERE user_id = $1', [userId]);
    }

    return {
      id: orderId, order_number: orderNumber, invoice_number: invoiceNumber,
      shipments: shipments.map(({ id, seller_type, seller_name, invoice_number, total_paise }) => ({ id, seller_type, seller_name, invoice_number, total_paise })),
      status: orderStatus, payment_terms: data.payment_terms,
      credit_due_date: creditDueDate, total_paise: totalPaise,
      has_schedule_h: hasScheduleH,
      requires_prescription: hasScheduleH && customerType === 'customer',
    };
  });

  await queueNotification({
    userId, type: 'order_status', status: 'placed',
    orderId: order.id, orderNumber: order.order_number,
  });

  return order;
}

// Low-stock alert for Dawabag-held lines after reservation (one per product per day)
async function recordLowStock(client: PoolClient, lines: any[], allocations: Allocation[]) {
  for (let i = 0; i < lines.length; i++) {
    if (allocations[i].seller_type !== 'dawabag' || !(lines[i].reorder_level_qty > 0)) continue;
    const left = (await client.query(
      `SELECT COALESCE(SUM(quantity_available - quantity_reserved), 0)::int AS qty
       FROM inventory_batches WHERE product_id = $1 AND expiry_date > CURRENT_DATE + 30`,
      [lines[i].product_id])).rows[0].qty;
    if (left <= lines[i].reorder_level_qty) {
      await client.query(
        `INSERT INTO low_stock_alerts (product_id, current_qty, reorder_level)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [lines[i].product_id, left, lines[i].reorder_level_qty]
      );
    }
  }
}
