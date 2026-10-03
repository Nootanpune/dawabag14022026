// Partner pharmacies' stock as it counts towards what the shop can sell. Owner
// decision (1 Oct 2026): partner stock makes a product available, but it stays in
// each partner's own ledger (partner_inventory) — it is only read here, never copied
// into Dawabag's batches; a sale reserves and deducts it there (allocation.service).
// Eligibility mirrors allocation.partnerCandidates: approved, active partner with a
// licence in date; approved, live listing; not recalled; enough shelf life; cold-chain
// stock only where cold storage is confirmed (C-05, C-25, C-27, C-28). Sprint 32: and
// only partners whose licence allows THIS buyer's kind of sale — retail (Form 20/21)
// or trade (Form 20B/21B) — so the stock shown equals what allocation can supply (C-33).
// Sprint 34: and of the form this medicine needs — 21 / 21B for Schedule C / C1, else 20 / 20B.
// Sprint 37: a partner on the live stock feed sells only while its last snapshot is
// fresh (SQL dawabag_partner_sellable, migration 32): stale → nothing, or only what is
// above the safety margin, per the partner's setting.
import { SaleKind, dawabagMaySupplySql, partnerMaySupplySql, sqlRef } from './sellingRights';

export const PARTNER_MIN_SHELF_DAYS = 30;
/** Dawabag's own batches need the same shelf life before they count (C-27). */
export const OWN_MIN_SHELF_DAYS = 30;

/** Sellable packs of one partner batch (pi, vendor v), with the live feed's staleness. */
export const PARTNER_SELLABLE = 'dawabag_partner_sellable(v.id, pi.qty_available, pi.qty_reserved)';

const eligible = (productExpr: string, kind: SaleKind) => `
  FROM partner_products pp
  JOIN vendors v ON v.id = pp.partner_id
  JOIN partner_inventory pi ON pi.partner_product_id = pp.id
  JOIN products px ON px.id = pp.product_id
  WHERE pp.product_id = ${sqlRef(productExpr)} AND pp.approval_status = 'approved' AND pp.listing_status = 'live'
    AND pi.is_recalled = FALSE AND ${PARTNER_SELLABLE} > 0
    AND pi.expiry_date > CURRENT_DATE + ${PARTNER_MIN_SHELF_DAYS}
    AND (COALESCE(px.cold_chain, FALSE) = FALSE OR pi.cold_chain_confirmed = TRUE)
    AND v.approval_status = 'approved' AND v.is_active = TRUE
    AND v.vendor_type IN ('marketplace_partner', 'both')
    AND (v.drug_license_expiry IS NULL OR v.drug_license_expiry >= CURRENT_DATE)
    AND ${partnerMaySupplySql('v', kind, productExpr)}`;

/** The most one partner can supply of the product to this kind of buyer (an order line goes to one seller). */
export const partnerStockSql = (productExpr: string, kind: SaleKind) =>
  `COALESCE((SELECT MAX(x.qty) FROM (SELECT SUM(${PARTNER_SELLABLE})::int AS qty ${eligible(productExpr, kind)} GROUP BY v.id) x), 0)`;

/** Earliest expiry among partner batches sellable to this kind of buyer, for the declared batch expiry (C-27). */
export const partnerNearestExpirySql = (productExpr: string, kind: SaleKind) =>
  `(SELECT MIN(pi.expiry_date) ${eligible(productExpr, kind)})`;

/**
 * Dawabag's own sellable stock of the product for this kind of buyer: 0 when Dawabag's
 * licence register has no in-date licence for that kind of sale (C-07; the admin
 * dashboard says so — services/stock/sellingRightsStatus.ts).
 */
export const ownStockSql = (productExpr: string, kind: SaleKind) =>
  `(CASE WHEN ${dawabagMaySupplySql(kind, productExpr)} THEN (SELECT COALESCE(SUM(ob.quantity_available - ob.quantity_reserved), 0)
     FROM inventory_batches ob WHERE ob.product_id = ${sqlRef(productExpr)} AND ob.expiry_date > CURRENT_DATE + ${OWN_MIN_SHELF_DAYS}
       AND ob.is_recalled = FALSE AND ob.quantity_available > ob.quantity_reserved) ELSE 0 END)`;

/** Earliest expiry of Dawabag's own sellable batches for this kind of buyer (NULL when it may not sell). */
export const ownNearestExpirySql = (productExpr: string, kind: SaleKind) =>
  `(CASE WHEN ${dawabagMaySupplySql(kind, productExpr)} THEN (SELECT MIN(ob.expiry_date)
     FROM inventory_batches ob WHERE ob.product_id = ${sqlRef(productExpr)} AND ob.expiry_date > CURRENT_DATE + ${OWN_MIN_SHELF_DAYS}
       AND ob.is_recalled = FALSE AND ob.quantity_available > ob.quantity_reserved) END)`;

/** The most ONE seller can supply to this kind of buyer: Dawabag's batches or one partner's ledger. */
export const sellableStockSql = (productExpr: string, kind: SaleKind) =>
  `GREATEST(${ownStockSql(productExpr, kind)}, ${partnerStockSql(productExpr, kind)})`;
