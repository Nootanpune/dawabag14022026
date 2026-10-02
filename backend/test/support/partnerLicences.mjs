// Sprint 32 — a partner sells only under its CHECKED drug licences in the register
// (party_licences): Form 20 / 21 to retail buyers, Form 20B / 21B to trade buyers
// (C-33). Test partners inserted straight into vendors have none, so they would sell
// to nobody; this gives them checked licences (all four forms unless told otherwise),
// numbered and dated like their vendors row so the derived summary (number, expiry)
// stays as the fixture set it. Made-up test data only.
//   q: (sql, params) => Promise<rows>
export async function licencePartner(q, vendorId, forms = ['dl20', 'dl21', 'dl20b', 'dl21b'], validUpto = null) {
  await q(
    `INSERT INTO party_licences (vendor_id, form, licence_number, valid_upto, status, verified_at)
     SELECT v.id, f, COALESCE(NULLIF(btrim(v.drug_license_no), ''), 'TEST-DL-' || left(v.id::text, 8)),
            COALESCE($3::date, v.drug_license_expiry, CURRENT_DATE + 700), 'verified', NOW()
     FROM vendors v CROSS JOIN unnest($2::text[]) AS f
     WHERE v.id = $1
       AND NOT EXISTS (SELECT 1 FROM party_licences p WHERE p.vendor_id = v.id AND p.form = f AND p.status = 'verified')`,
    [vendorId, forms, validUpto]);
}
