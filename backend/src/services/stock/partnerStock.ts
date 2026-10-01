// Partner pharmacies' stock as it counts towards what the shop can sell. Owner
// decision (1 Oct 2026): partner stock makes a product available, but it stays in
// each partner's own ledger (partner_inventory) — it is only read here, never copied
// into Dawabag's batches; a sale reserves and deducts it there (allocation.service).
// Eligibility mirrors allocation.partnerCandidates: approved, active partner with a
// licence in date; approved, live listing; not recalled; enough shelf life; cold-chain
// stock only where cold storage is confirmed (C-05, C-25, C-27, C-28).
export const PARTNER_MIN_SHELF_DAYS = 30;

const eligible = (productExpr: string) => `
  FROM partner_products pp
  JOIN vendors v ON v.id = pp.partner_id
  JOIN partner_inventory pi ON pi.partner_product_id = pp.id
  JOIN products px ON px.id = pp.product_id
  WHERE pp.product_id = ${productExpr} AND pp.approval_status = 'approved' AND pp.listing_status = 'live'
    AND pi.is_recalled = FALSE AND pi.qty_available > pi.qty_reserved
    AND pi.expiry_date > CURRENT_DATE + ${PARTNER_MIN_SHELF_DAYS}
    AND (COALESCE(px.cold_chain, FALSE) = FALSE OR pi.cold_chain_confirmed = TRUE)
    AND v.approval_status = 'approved' AND v.is_active = TRUE
    AND v.vendor_type IN ('marketplace_partner', 'both')
    AND (v.drug_license_expiry IS NULL OR v.drug_license_expiry >= CURRENT_DATE)`;

/** The most one partner can supply of the product (an order line goes to one seller). */
export const partnerStockSql = (productExpr: string) =>
  `COALESCE((SELECT MAX(x.qty) FROM (SELECT SUM(pi.qty_available - pi.qty_reserved)::int AS qty ${eligible(productExpr)} GROUP BY v.id) x), 0)`;

/** Earliest expiry among sellable partner batches, for the declared batch expiry (C-27). */
export const partnerNearestExpirySql = (productExpr: string) =>
  `(SELECT MIN(pi.expiry_date) ${eligible(productExpr)})`;
