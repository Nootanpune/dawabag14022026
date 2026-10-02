// GET /medicines/:productId/delivery?pincode= — the product page's estimated
// delivery date for the buyer's PIN code (Sprint 33). The PIN comes from the
// request (typed on the page, never stored on the device) or, for a signed-in
// buyer, from their default delivery address on the server. Which sellers could
// supply follows the shop's stock rules: Dawabag's sellable batches (> 30 days
// shelf life, not recalled; cold-chain lines only where Dawabag's delivery to
// that PIN is cold-chain capable, C-25) and partner stock (partnerStock.ts —
// read only). The date itself is computed conservatively in deliveryEstimate.ts.
import { queryOne } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { BuyerType, requiresPrescription } from '../../utils/customerType';
import { partnerStockSql } from '../stock/partnerStock';
import { deliveryLabel, estimatedDeliveryDate } from './deliveryEstimate';

const PIN_RE = /^[1-9]\d{5}$/;

export async function deliveryEstimateFor(productId: string, pricingType: BuyerType, opts: { pincode?: string; userId?: string; now?: Date }) {
  let pincode = opts.pincode && PIN_RE.test(opts.pincode) ? opts.pincode : null;
  if (opts.pincode && !pincode) throw new AppError('Enter a 6-digit PIN code', 400);
  let source: 'entered' | 'saved_address' | null = pincode ? 'entered' : null;
  if (!pincode && opts.userId) {
    const a = await queryOne<{ pincode: string }>(
      `SELECT pincode FROM addresses WHERE user_id = $1 AND deleted_at IS NULL ORDER BY is_default DESC, created_at DESC LIMIT 1`,
      [opts.userId]);
    if (a?.pincode && PIN_RE.test(a.pincode)) { pincode = a.pincode; source = 'saved_address'; }
  }
  if (!pincode) return { pincode: null, needs_pincode: true };

  const p = await queryOne<any>(
    `SELECT p.id, p.cold_chain, p.drug_schedule,
            (SELECT COALESCE(SUM(b.quantity_available - b.quantity_reserved), 0) FROM inventory_batches b
              WHERE b.product_id = p.id AND b.expiry_date > CURRENT_DATE + 30 AND b.is_recalled = FALSE)::int AS own_qty,
            (${partnerStockSql('p.id')})::int AS partner_qty
     FROM products p
     WHERE p.id = $1 AND p.is_active = TRUE AND p.deleted_at IS NULL
       AND COALESCE(p.drug_schedule, '') NOT IN ('Schedule X', 'NDPS')`, [productId]);
  if (!p) throw new AppError('Product not found', 404);
  const pin = await queryOne<any>(
    `SELECT is_serviceable, estimated_days, dawabag_delivery_hours, cold_chain_available, city
     FROM pincode_serviceability WHERE pincode = $1`, [pincode]);
  const base = { pincode, pincode_source: source, estimated: true as const };
  if (!pin || !pin.is_serviceable) {
    return { ...base, serviceable: false, deliver_by: null, label: null, message: 'We do not deliver to this PIN code yet.' };
  }
  const ownStock = Number(p.own_qty) > 0 && (!p.cold_chain || !!pin.cold_chain_available);
  const partnerStock = Number(p.partner_qty) > 0;
  const date = estimatedDeliveryDate({
    now: opts.now ?? new Date(),
    estimatedDays: Number(pin.estimated_days ?? 5),
    ownDeliveryHours: pin.dawabag_delivery_hours == null ? null : Number(pin.dawabag_delivery_hours),
    ownStock, partnerStock,
    needsPrescriptionCheck: requiresPrescription(pricingType, p.drug_schedule),
  });
  if (!date) {
    return { ...base, serviceable: true, city: pin.city ?? null, deliver_by: null, label: null,
      message: Number(p.own_qty) > 0 && p.cold_chain
        ? 'This medicine needs cold-chain delivery, which is not available to this PIN code yet.'
        : 'Out of stock right now.' };
  }
  return { ...base, serviceable: true, city: pin.city ?? null, deliver_by: date, label: deliveryLabel(date),
    message: 'Estimated. Checkout shows the delivery time for your whole order.' };
}
