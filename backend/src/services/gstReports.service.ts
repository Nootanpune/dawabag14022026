// src/services/gstReports.service.ts — accountant reports, built from the
// database on request (Rulebook C-30, C-32, C-34). Dawabag's own supplies feed
// its GSTR-1; partner supplies are the partners' own returns, and Dawabag files
// GSTR-8 (TCS) and deducts TDS u/s 194-O on them from the settlements.
// Amounts are paise; place of supply is the delivery address state.
import { query } from '../config/database';

type Range = { from: string; to: string };

const BUYER = `COALESCE(NULLIF(u.business_name, ''), up.full_name, a.full_name)`;

// One row per Dawabag tax invoice (cancelled ones stay; their credit notes reverse them)
export async function salesRegister({ from, to }: Range) {
  return query(
    `SELECT s.invoice_number, s.created_at::date AS invoice_date, o.order_number, ${BUYER} AS buyer_name,
            o.buyer_gstin, CASE WHEN o.buyer_gstin IS NULL THEN 'B2C' ELSE 'B2B' END AS supply_type,
            a.state AS place_of_supply, s.subtotal_paise AS taxable_paise,
            SUM(oi.cgst_paise)::int AS cgst_paise, SUM(oi.sgst_paise)::int AS sgst_paise, SUM(oi.igst_paise)::int AS igst_paise,
            s.total_paise, s.status
     FROM order_shipments s JOIN orders o ON o.id = s.order_id JOIN addresses a ON a.id = o.address_id
     JOIN users u ON u.id = o.user_id LEFT JOIN user_profiles up ON up.user_id = o.user_id
     JOIN order_items oi ON oi.shipment_id = s.id
     WHERE s.seller_type = 'dawabag' AND s.created_at::date BETWEEN $1 AND $2
     GROUP BY s.id, o.id, a.id, u.id, up.full_name ORDER BY s.invoice_number`, [from, to]);
}

export async function creditNoteRegister({ from, to }: Range) {
  return query(
    `SELECT cn.credit_note_number, cn.created_at::date AS note_date, s.invoice_number AS against_invoice,
            s.created_at::date AS invoice_date, ${BUYER} AS buyer_name, o.buyer_gstin,
            CASE WHEN o.buyer_gstin IS NULL THEN 'B2C' ELSE 'B2B' END AS supply_type, a.state AS place_of_supply,
            cn.reason, cn.taxable_paise, cn.cgst_paise, cn.sgst_paise, cn.igst_paise, cn.total_paise
     FROM credit_notes cn JOIN order_shipments s ON s.id = cn.shipment_id JOIN orders o ON o.id = cn.order_id
     JOIN addresses a ON a.id = o.address_id JOIN users u ON u.id = o.user_id LEFT JOIN user_profiles up ON up.user_id = o.user_id
     WHERE s.seller_type = 'dawabag' AND cn.created_at::date BETWEEN $1 AND $2
     ORDER BY cn.credit_note_number`, [from, to]);
}

// HSN-wise summary, net of credit notes issued in the same period
export async function hsnSummary({ from, to }: Range) {
  return query(
    `WITH lines AS (
       SELECT p.hsn_code, oi.gst_rate, oi.quantity AS qty, oi.line_total_paise - oi.gst_amount_paise AS taxable,
              oi.cgst_paise AS cgst, oi.sgst_paise AS sgst, oi.igst_paise AS igst
       FROM order_items oi JOIN order_shipments s ON s.id = oi.shipment_id JOIN products p ON p.id = oi.product_id
       WHERE s.seller_type = 'dawabag' AND s.created_at::date BETWEEN $1 AND $2
       UNION ALL
       SELECT p.hsn_code, oi.gst_rate, -ci.quantity, -ci.taxable_paise,
              -CASE WHEN oi.igst_paise > 0 THEN 0 ELSE ci.gst_paise / 2 END,
              -CASE WHEN oi.igst_paise > 0 THEN 0 ELSE ci.gst_paise - ci.gst_paise / 2 END,
              -CASE WHEN oi.igst_paise > 0 THEN ci.gst_paise ELSE 0 END
       FROM credit_note_items ci JOIN credit_notes cn ON cn.id = ci.credit_note_id
       JOIN order_items oi ON oi.id = ci.order_item_id JOIN order_shipments s ON s.id = cn.shipment_id
       JOIN products p ON p.id = oi.product_id
       WHERE s.seller_type = 'dawabag' AND cn.created_at::date BETWEEN $1 AND $2)
     SELECT COALESCE(hsn_code, 'NOT SET') AS hsn_code, gst_rate, SUM(qty)::int AS quantity, SUM(taxable)::bigint AS taxable_paise,
            SUM(cgst)::bigint AS cgst_paise, SUM(sgst)::bigint AS sgst_paise, SUM(igst)::bigint AS igst_paise
     FROM lines GROUP BY hsn_code, gst_rate ORDER BY hsn_code, gst_rate`, [from, to]);
}

// GSTR-1 tables: B2B invoices, B2C small by place of supply and rate, credit notes
export async function gstr1Summary({ from, to }: Range) {
  const rows = await query<any>(
    `SELECT CASE WHEN o.buyer_gstin IS NULL THEN 'B2CS' ELSE 'B2B' END AS section, a.state AS place_of_supply, oi.gst_rate,
            COUNT(DISTINCT s.id)::int AS documents, SUM(oi.line_total_paise - oi.gst_amount_paise)::bigint AS taxable_paise,
            SUM(oi.cgst_paise)::bigint AS cgst_paise, SUM(oi.sgst_paise)::bigint AS sgst_paise, SUM(oi.igst_paise)::bigint AS igst_paise
     FROM order_items oi JOIN order_shipments s ON s.id = oi.shipment_id JOIN orders o ON o.id = s.order_id
     JOIN addresses a ON a.id = o.address_id
     WHERE s.seller_type = 'dawabag' AND s.created_at::date BETWEEN $1 AND $2
     GROUP BY 1, 2, 3
     UNION ALL
     SELECT CASE WHEN o.buyer_gstin IS NULL THEN 'CDNUR' ELSE 'CDNR' END, a.state, oi.gst_rate, COUNT(DISTINCT cn.id)::int,
            -SUM(ci.taxable_paise)::bigint,
            -SUM(CASE WHEN oi.igst_paise > 0 THEN 0 ELSE ci.gst_paise / 2 END)::bigint,
            -SUM(CASE WHEN oi.igst_paise > 0 THEN 0 ELSE ci.gst_paise - ci.gst_paise / 2 END)::bigint,
            -SUM(CASE WHEN oi.igst_paise > 0 THEN ci.gst_paise ELSE 0 END)::bigint
     FROM credit_note_items ci JOIN credit_notes cn ON cn.id = ci.credit_note_id JOIN order_items oi ON oi.id = ci.order_item_id
     JOIN order_shipments s ON s.id = cn.shipment_id JOIN orders o ON o.id = cn.order_id JOIN addresses a ON a.id = o.address_id
     WHERE s.seller_type = 'dawabag' AND cn.created_at::date BETWEEN $1 AND $2
     GROUP BY 1, 2, 3
     ORDER BY 1, 2, 3`, [from, to]);
  return rows;
}

// TCS (GSTR-8) and TDS (194-O) on partner sales, from the settlements in the period
export async function marketplaceTaxes({ from, to }: Range) {
  return query(
    `SELECT sb.batch_ref, sb.period_from, sb.period_to, v.name AS partner_name, v.gst_number AS partner_gstin,
            substring(v.gst_number from 3 for 10) AS partner_pan, v.state AS partner_state,
            (sb.taxable_value_paise + r.returned_taxable)::bigint AS gross_taxable_paise,
            r.returned_taxable AS returns_taxable_paise, sb.taxable_value_paise AS net_taxable_paise,
            sb.tcs_pct, sb.tcs_paise, sb.tds_pct, sb.tds_paise, sb.payment_status
     FROM settlement_batches sb JOIN vendors v ON v.id = sb.partner_id
     CROSS JOIN LATERAL (SELECT COALESCE(-SUM(a.taxable_paise), 0)::bigint AS returned_taxable
                         FROM settlement_adjustments a WHERE a.settlement_batch_id = sb.id) r
     WHERE sb.period_to BETWEEN $1 AND $2 ORDER BY v.name, sb.period_to`, [from, to]);
}

export const REPORTS = {
  'sales-register': salesRegister,
  'credit-notes': creditNoteRegister,
  'hsn-summary': hsnSummary,
  'gstr1-summary': gstr1Summary,
  'marketplace-tcs-tds': marketplaceTaxes,
} as const;
export type ReportName = keyof typeof REPORTS;
