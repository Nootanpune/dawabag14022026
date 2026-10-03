// "Sales to doctors and medical institutions" register (Sprint 44) — the records the FDA
// Maharashtra (Pune Division) circular No. Drug/Wholesalers Memo./16/2026/1 dated 30-09-2026
// asks every wholesale licence holder to keep up to date: the bill (tax invoice), what was
// supplied (items, batches, quantities), the doctor's registration (number, council, valid
// till) with a copy of the registration certificate, the signed written order (Drugs Rules
// r.65(9)(b)) and the pharmacist / competent person who supervised the sale (r.64(2)).
// Admin sees every seller; a partner sees only its own sales (it is the licensee). One row per
// invoiced line, built from the database on request (nothing written to disk); invoices,
// written orders and registrations are kept as long as the sale records (no purge).
import { query } from '../../config/database';

export interface RegisterFilter { from: string; to: string; partnerId?: string }

export const PRACTITIONER_REGISTER_COLUMNS = [
  'invoice_date', 'invoice_number', 'seller', 'seller_licences', 'order_number', 'buyer_name', 'buyer_kind', 'institution',
  'registration_number', 'council', 'registration_valid_till', 'certificate_on_file', 'written_order', 'written_order_signed_at',
  'product_name', 'batch_number', 'expiry', 'quantity', 'taxable_paise', 'gst_paise', 'line_total_paise',
  'pharmacist_name', 'pharmacist_reg_no', 'shipment_status',
] as const;

export async function practitionerSalesRegister(f: RegisterFilter) {
  const params: unknown[] = [f.from, f.to];
  let where = `s.invoice_number IS NOT NULL AND s.invoice_issued_at::date BETWEEN $1 AND $2
    AND COALESCE(s.sale_buyer_type, o.pricing_type) = 'doc_hospital'`;
  if (f.partnerId) { params.push(f.partnerId); where += ` AND s.partner_id = $${params.length}`; }
  const rows = await query<any>(
    `SELECT s.id AS shipment_id, s.invoice_issued_at::date AS invoice_date, s.invoice_number, s.seller_type, COALESCE(v.name, 'Dawabag') AS seller,
            (SELECT string_agg((l->>'label') || ': ' || (l->>'number'), ' · ') FROM jsonb_array_elements(COALESCE(s.sale_licences, '[]'::jsonb)) l) AS seller_licences,
            o.id AS order_id, o.order_number, COALESCE(NULLIF(u.business_name, ''), up.full_name) AS buyer_name,
            COALESCE(s.buyer_registration, wo.practitioner) AS registration,
            wo.written_orders,
            oi.product_name, COALESCE(ib.batch_number, pi.batch_number) AS batch_number,
            to_char(COALESCE(ib.expiry_date, pi.expiry_date), 'YYYY-MM') AS expiry, oi.supply_qty AS quantity,
            (oi.unit_price_paise * oi.quantity) AS taxable_paise, oi.gst_amount_paise AS gst_paise, oi.line_total_paise,
            s.pharmacist_name, s.pharmacist_reg_no, s.pharmacist_registration->>'state_council' AS pharmacist_council, s.status AS shipment_status
     FROM order_shipments s
     JOIN orders o ON o.id = s.order_id JOIN users u ON u.id = o.user_id LEFT JOIN user_profiles up ON up.user_id = o.user_id
     LEFT JOIN vendors v ON v.id = s.partner_id
     JOIN order_items oi ON oi.shipment_id = s.id
     LEFT JOIN inventory_batches ib ON ib.id = oi.batch_id
     LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id
     LEFT JOIN partner_inventory pi ON pi.id = poi.partner_inv_id
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object('id', w.id, 'kind', w.kind, 'signed_at', w.signed_at) ORDER BY w.signed_at) AS written_orders,
              (array_agg(w.practitioner ORDER BY w.signed_at))[1] AS practitioner
       FROM written_orders w WHERE w.order_id = o.id) wo ON TRUE
     WHERE ${where}
     ORDER BY s.invoice_issued_at, s.invoice_number, oi.product_name`, params);
  return rows.map((r) => {
    const reg = r.registration ?? {};
    const wos = (r.written_orders ?? []) as { id: string; kind: string; signed_at: string }[];
    return {
      invoice_date: r.invoice_date, invoice_number: r.invoice_number, shipment_id: r.shipment_id, seller_type: r.seller_type, seller: r.seller,
      seller_licences: r.seller_licences, order_id: r.order_id, order_number: r.order_number, buyer_name: r.buyer_name,
      buyer_kind: reg.kind ?? 'doctor', institution: reg.institution?.name ?? null,
      registration_number: reg.registration_number ?? null, council: reg.council ?? null, registration_valid_till: reg.valid_till ?? null,
      certificate_on_file: !!reg.certificate_key,
      // links for the register page (each view audited); the API paths, not object-store addresses
      certificate_link: wos[0] && reg.certificate_key ? `/written-orders/${wos[0].id}/certificate` : null,
      written_order: wos.map((w) => `${w.kind === 'upload' ? 'Uploaded signed requisition' : 'Signed in app'} ${String(w.id).slice(0, 8)}`).join('; ') || null,
      written_order_ids: wos.map((w) => w.id),
      written_order_links: wos.map((w) => `/written-orders/${w.id}/document`),
      written_order_signed_at: wos[0]?.signed_at ?? null,
      product_name: r.product_name, batch_number: r.batch_number, expiry: r.expiry, quantity: r.quantity,
      taxable_paise: Number(r.taxable_paise), gst_paise: Number(r.gst_paise), line_total_paise: Number(r.line_total_paise),
      pharmacist_name: r.pharmacist_name, pharmacist_reg_no: r.pharmacist_reg_no, pharmacist_council: r.pharmacist_council,
      shipment_status: r.shipment_status,
    };
  });
}
