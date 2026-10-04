// src/services/orderPlacement.service.ts
// Places an order for a buyer — used by POST /orders and by the refill job, so
// both apply identical rules: KYC gate, prices for the buyer's type, quantity
// limits, prescription flags, allocation to sellers, coupon, wallet, credit.
import { PoolClient } from 'pg';
import { z } from 'zod';
import { withTransactionRetry } from '../config/database';
import { AppError } from '../utils/AppError';
import { generateOrderNumber } from '../utils/helpers';
import { queueNotification } from './notification.service';
import { TRADE_TYPES, BuyerType, allowsCreditTerms, isBuyerType, requiresPrescription } from '../utils/customerType';
import { evaluateCoupon } from './coupon.service';
import { Allocation, allocateAndReserve } from './allocation.service';
import { saleKindFor } from './stock/sellingRights';
import { createShipmentsAndLines } from './shipment.service';
import { OrderPreview, buildCheckoutSummary } from './checkoutSummary.service';
import { moveOrderToFulfilment } from './paymentCapture.service';
import { freeDeliveryAbovePaise, qualifiesForFreeDelivery } from './delivery/freeDelivery';
import { listLicences, partyEligibility, snapshot } from './licences/register.service';
import { assertMaySellToPractitioner } from './practitionerSales/registration.service';
import { attachWrittenOrderTx } from './practitionerSales/writtenOrder.service';
import { PRACTITIONER_TYPE } from './practitionerSales/rules';
import { assertRxSalesOpen } from './emergencyStop/state.service';
import { attachPrescriptionTx } from './rxReuse.service';
import { priceOrderLine } from './orderLines/pricing';
import { buyerStanding } from './buyerRestriction/standing.service';
import { prescriptionRequiredError } from './prescriptions/requirement.service';

export const createOrderSchema = z.object({
  patient_id:           z.string().uuid().optional(),
  address_id:           z.string().uuid(),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity:   z.number().int().min(1),
  })).min(1)
    // One line per product, so per-order quantity limits cannot be split across lines
    .refine((items) => new Set(items.map((i) => i.product_id)).size === items.length, 'Each product may appear only once'),
  coupon_code:          z.string().optional(),
  wallet_amount_paise:  z.number().int().min(0).optional().default(0),
  pincode:              z.string().length(6),
  payment_terms:        z.enum(['prepaid','cad','net_7','net_15','net_30','net_45','net_60','postpaid'])
                         .optional().default('prepaid'),
  // Doctors/hospitals confirm on every order: own patients only, not for resale (C-15)
  practitioner_declaration: z.boolean().optional(),
  // Sprint 39: the prescription for the order's prescription lines, chosen BEFORE payment —
  // an upload not yet attached to an order, or a saved verified one still valid (C-08)
  prescription_id: z.string().uuid().optional(),
  // Sprint 44: a doctor / institution buyer's signed written order (Drugs Rules r.65(9)(b);
  // FDA Pune circular Drug/Wholesalers Memo./16/2026/1) — uploaded or signed in the app first
  written_order_id: z.string().uuid().optional(),
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
  preview?: boolean;   // build the checkout summary, then roll back (C-35)
}

export async function placeOrder(buyer: OrderBuyer, data: CreateOrderInput, opts: PlaceOrderOptions = {}) {
  const userId       = buyer.id;
  const customerType = buyer.pricing_type;
  const isB2B        = allowsCreditTerms(customerType);

  // Trade accounts cannot order until admin approves their KYC (URS v3.1 §2)
  const registeredType = buyer.customer_type;
  if (isBuyerType(registeredType) && TRADE_TYPES.includes(registeredType) && buyer.kyc_status !== 'approved') {
    throw new AppError('Your business account is awaiting KYC approval. Orders open once our team verifies your documents.', 403);
  }
  // Every checked licence must be in date — on the day it lapses, not only after the nightly job (C-14, Sprint 30)
  if (registeredType === 'b2b_retailer' || registeredType === 'b2b_wholesaler') {
    const check = await partyEligibility({ userId }, registeredType === 'b2b_retailer' ? 'retailer' : 'wholesaler');
    // (a missing kind cannot reach here: KYC approval needs it; older accounts keep the approval they had)
    if (check.expired.length) {
      throw new AppError(`Trade orders are paused: ${check.expired.join('; ')}. Send the renewed licence from your account (Your drug licences).`, 403);
    }
  }

  if (registeredType === 'doc_hospital' && !opts.preview && !opts.refill && data.practitioner_declaration !== true) {
    throw new AppError('Please confirm these medicines are for dispensing to your own patients and not for resale', 400);
  }

  // Validate payment terms against customer type
  if (!isB2B && data.payment_terms !== 'prepaid') {
    throw new AppError('Credit and CAD terms are only available for B2B accounts', 400);
  }

  // Retried if chosen as a deadlock victim, e.g. against a partner's live stock snapshot (Sprint 38)
  const order = await withTransactionRetry(async (client) => {
    // Sprint 44: no sale to a doctor / institution whose council registration is not verified
    // by Dawabag staff, in date and backed by the certificate copy (r.65(9)(b); FDA Pune circular
    // Drug/Wholesalers Memo./16/2026/1 — never supply an unqualified or unauthorised "doctor")
    if (registeredType === PRACTITIONER_TYPE && customerType === PRACTITIONER_TYPE) await assertMaySellToPractitioner(client, userId);
    // The address and patient must be the buyer's own; the delivery PIN code is
    // the address's, never a separate value from the request
    const addr = (await client.query(
      'SELECT pincode FROM addresses WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL', [data.address_id, userId])).rows[0];
    if (!addr) throw new AppError('Delivery address not found', 404);
    data = { ...data, pincode: addr.pincode };
    if (data.patient_id) {
      const pat = (await client.query(
        'SELECT 1 FROM patients WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL', [data.patient_id, userId])).rows[0];
      if (!pat) throw new AppError('Patient not found', 404);
    }
    // Sprint 47: who may buy each product — the buyer's standing now (verified doctor / hospital,
    // licensed trade buyer), in this transaction; also refills placed by the job
    const standing = await buyerStanding(client, { id: userId, customer_type: registeredType, kyc_status: buyer.kyc_status });
    let subtotalPaise = 0;
    let gstPaise      = 0;
    let discountPaise = 0;
    let hasScheduleH  = false;
    const lineItems: any[] = [];

    for (const item of data.items) {
      // Shared with lines added before the invoice (Sprint 44): X / NDPS refused, online-sale
      // status (C-10), who may buy it (Sprint 47, 403 BUYER_RESTRICTED), the buyer type's minimum / maximum and price
      const li = await priceOrderLine(client, item, customerType, standing);
      if (li.needs_prescription) hasScheduleH = true;
      subtotalPaise += li.assessable_paise;
      gstPaise      += li.gst_amount_paise;
      lineItems.push(li);
    }

    // Emergency stop (Sprint 38): no checkout of prescription medicines while paused (C-08)
    await assertRxSalesOpen(client, customerType, lineItems.map((li) => ({ name: li.product_name, drug_schedule: li.drug_schedule })));

    // Seller per line (Dawabag or partner) + stock reservation — services/allocation.service.ts
    const allocations = await allocateAndReserve(client, {
      lines: lineItems.map((li) => ({
        product_id: li.product_id, product_name: li.product_name,
        quantity: li.quantity, cold_chain: li.cold_chain,
      })),
      orderValuePaise: subtotalPaise + gstPaise,
      pincode: data.pincode,
      // Sellers licensed for this buyer's kind of sale only (Sprint 32, C-33, C-07)
      saleKind: saleKindFor(customerType),
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
      // Per-buyer limit, then an atomic use count so concurrent orders cannot overrun the total
      const lim = (await client.query(
        `SELECT c.per_user_limit, (SELECT COUNT(*) FROM coupon_redemptions r JOIN orders o ON o.id = r.order_id
            WHERE r.coupon_id = c.id AND r.user_id = $2 AND o.status <> 'cancelled')::int AS used
         FROM coupons c WHERE c.id = $1`, [couponId, userId])).rows[0];
      if (lim?.per_user_limit != null && lim.used >= lim.per_user_limit) throw new AppError('You have already used this coupon', 400);
      const took = await client.query(
        `UPDATE coupons SET uses_count = uses_count + 1 WHERE id = $1 AND (uses_limit IS NULL OR uses_count < uses_limit) RETURNING id`,
        [couponId]);
      if (!took.rowCount) throw new AppError('This coupon has been fully used', 400);
    }

    // Shipping — free for B2B orders above Rs.5000, and for retail above the set amount
    const pincodeRes = await client.query(
      'SELECT shipping_charge_paise FROM pincode_serviceability WHERE pincode = $1',
      [data.pincode]
    );
    let shippingPaise = pincodeRes.rows[0]?.shipping_charge_paise ?? 4900;
    if (isB2B && subtotalPaise >= 500000) shippingPaise = 0;
    // Retail: free above the owner's amount, judged on the medicines after any coupon
    if (!isB2B && qualifiesForFreeDelivery(await freeDeliveryAbovePaise(client), subtotalPaise - discountPaise)) shippingPaise = 0;

    // Wallet
    let walletUsedPaise = 0;
    if (data.payment_terms === 'prepaid' && data.wallet_amount_paise > 0) {
      const profile = await client.query(
        'SELECT wallet_balance_paise FROM user_profiles WHERE user_id = $1 FOR UPDATE',
        [userId]
      );
      // Never more than the order costs
      const payable = Math.max(0, subtotalPaise + gstPaise + shippingPaise - discountPaise);
      walletUsedPaise = Math.min(data.wallet_amount_paise, profile.rows[0]?.wallet_balance_paise ?? 0, payable);
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
    // Every checked drug licence of a licensed trade buyer, as on the day of sale (C-13, Sprint 30)
    const tradeBuyer = isBuyerType(registeredType) && TRADE_TYPES.includes(registeredType);
    const buyerLicences = tradeBuyer
      ? (await listLicences({ userId }, { client })).filter((l) => l.status === 'verified') : [];
    const buyerGstin = buyerRow.rows[0]?.gstin || null;

    let orderStatus = data.payment_terms === 'prepaid' ? 'pending_payment' : 'confirmed';
    const orderNumber = generateOrderNumber();

    const newOrder = await client.query(
      `INSERT INTO orders (
         order_number, invoice_number, user_id, patient_id, address_id,
         status, payment_terms, credit_due_date,
         subtotal_paise, discount_paise, shipping_paise, gst_paise,
         total_paise, coupon_id, wallet_used_paise,
         buyer_gstin, buyer_pan, e_invoice_status, buyer_drug_license,
         refill_subscription_id, refill_for_date, buyer_drug_licences,
         pricing_type, placed_subtotal_paise, placed_gst_paise, placed_discount_paise
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$9,$12,$10)
       RETURNING id, order_number, invoice_number`,
      [
        orderNumber, null,   // Sprint 44: Dawabag's invoice number is set when its shipment is released by the pharmacist
        userId, data.patient_id||null, data.address_id,
        orderStatus, data.payment_terms, creditDueDate,
        subtotalPaise, discountPaise, shippingPaise, gstPaise,
        totalPaise, couponId, walletUsedPaise,
        buyerGstin, buyerRow.rows[0]?.pan_number||null,
        buyerGstin ? 'pending' : 'not_applicable',
        // Licensed trade buyers only (Rulebook C-13)
        tradeBuyer ? (buyerRow.rows[0]?.drug_license_number || null)?.slice(0, 100) ?? null : null,
        opts.refill?.subscriptionId ?? null, opts.refill?.forDate ?? null,
        buyerLicences.length ? JSON.stringify(snapshot(buyerLicences)) : null,
        customerType,
      ]
    );
    const orderId = newOrder.rows[0].id;

    // One shipment per seller of record; lines attached to their shipment. Sprint 44 (owner
    // decision CONFIRMED 2026-10-03): the tax invoice — number, date and the frozen sale record
    // (Sprint 42) — is issued when the pharmacist approves each shipment, not here, so the buyer
    // may still change the order until then (services/orderEdit).
    const shipments = await createShipmentsAndLines(client, orderId, lineItems, allocations);
    const invoiceNumber: string | null = null;

    // Sprint 44: every order from a doctor / institution carries its signed written order,
    // attached now — no written order, no order (and so no payment). r.65(9)(b)
    let writtenOrder: { id: string; kind: string } | null = null;
    if (registeredType === PRACTITIONER_TYPE && customerType === PRACTITIONER_TYPE && !opts.preview) {
      writtenOrder = await attachWrittenOrderTx(client, userId, data.written_order_id, {
        orderId, lines: lineItems.map((li) => ({ product_id: li.product_id, product_name: li.product_name, quantity: li.quantity })) });
    }

    if (registeredType === 'doc_hospital') {
      await client.query('UPDATE orders SET practitioner_declared_at = NOW() WHERE id = $1', [orderId]);
    }
    // Prescription before payment (Sprint 39, C-08): attached here, in the same transaction,
    // or the order is not placed. A refill order is created by the server; its buyer adds
    // the prescription before paying (payment creation checks it again).
    let prescription: Awaited<ReturnType<typeof attachPrescriptionTx>> | null = null;
    if (hasScheduleH && !opts.preview) {
      if (data.prescription_id) prescription = await attachPrescriptionTx(client, userId, data.prescription_id, orderId);
      else if (!opts.refill) {
        throw prescriptionRequiredError(lineItems.filter((li) => requiresPrescription(customerType, li.drug_schedule)).map((li) => li.product_name));
      }
    }
    if (couponId) {
      await client.query('INSERT INTO coupon_redemptions (coupon_id, user_id, order_id) VALUES ($1, $2, $3)', [couponId, userId, orderId]);
    }
    // Fully paid from the wallet: nothing to collect, so it goes straight to fulfilment
    if (orderStatus === 'pending_payment' && totalPaise === 0) {
      orderStatus = await moveOrderToFulfilment(client, orderId);
    }
    if (opts.preview) {
      const summary = await buildCheckoutSummary(client, orderId, data.pincode, isB2B);
      // Sprint 39: the checkout asks for the prescription first; payment is captured after the pharmacist check
      throw new OrderPreview({ ...summary, prescription_required: hasScheduleH, capture: hasScheduleH ? 'after_pharmacist_check' : 'now',
        // Sprint 44: doctors / institutions sign or upload a written order before placing (r.65(9)(b))
        written_order_required: registeredType === PRACTITIONER_TYPE && customerType === PRACTITIONER_TYPE } as any);
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
      // Sprint 39: attached prescription and how the payment is taken
      prescription: prescription ? { id: prescription.prescription_id, status: prescription.status } : null,
      // Sprint 44: the doctor's / institution's signed written order (r.65(9)(b))
      written_order: writtenOrder,
      capture: hasScheduleH ? 'after_pharmacist_check' : 'now',
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
       FROM inventory_batches WHERE product_id = $1 AND expiry_date > CURRENT_DATE + 30 AND is_recalled = FALSE AND gdp_status = 'ok'`,
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

// Checkout summary without placing: runs placement and rolls it back, so stock,
// coupon uses, wallet, credit and invoice numbers are untouched (C-35)
export async function previewOrder(buyer: OrderBuyer, data: CreateOrderInput) {
  try {
    await placeOrder(buyer, data, { preview: true });
  } catch (e) {
    if (e instanceof OrderPreview) return e.summary;
    throw e;
  }
  throw new AppError('Preview failed', 500);
}
