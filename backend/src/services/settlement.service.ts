// src/services/settlement.service.ts
// Partner settlements (Sprint 3 task 20, owner decision: partners are seller of
// record). One batch per partner per period over DELIVERED, unsettled lines.
// Dawabag's commission + finding fee are billed on a Dawabag services invoice
// (series 'DWS'); TCS/TDS are withheld per settlementMath.ts.
import { query, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { getSetting } from './settings.service';
import { computeSettlement } from './settlementMath';

const DEFAULT_COMMISSION_PCT = 8;
const DEFAULT_FINDING_FEE_PAISE = 1500;

export async function generateSettlements(periodFrom: string, periodTo: string, createdBy: string | null) {
  if (periodFrom > periodTo) throw new AppError('period_from must be on or before period_to', 400);
  const tcsPct = Number(await getSetting('marketplace.tcs_pct', 0.5));
  const tdsPct = Number(await getSetting('marketplace.tds_pct', 0.1));
  const feeGstPct = Number(await getSetting('marketplace.fee_gst_pct', 18));

  // Lines delivered in the period (a later return is netted by its adjustment),
  // plus partners with open return adjustments (C-37)
  const partners = await query<{ partner_id: string }>(
    `SELECT partner_id FROM partner_order_items
     WHERE dispatch_status IN ('delivered', 'returned') AND settlement_batch_id IS NULL
       AND delivered_at::date BETWEEN $1 AND $2
     UNION
     SELECT partner_id FROM settlement_adjustments WHERE settlement_batch_id IS NULL AND created_at::date <= $2`,
    [periodFrom, periodTo]);

  const created: any[] = [];
  for (const { partner_id } of partners) {
    const batch = await withTransaction(async (client) => {
      const lines = (await client.query(
        `SELECT id, shipment_id, line_value_paise, line_gst_paise FROM partner_order_items
         WHERE partner_id = $1 AND dispatch_status IN ('delivered', 'returned') AND settlement_batch_id IS NULL
           AND delivered_at::date BETWEEN $2 AND $3
         FOR UPDATE`, [partner_id, periodFrom, periodTo])).rows;
      const adjustments = (await client.query(
        `SELECT id, taxable_paise, gst_paise FROM settlement_adjustments
         WHERE partner_id = $1 AND settlement_batch_id IS NULL AND created_at::date <= $2 FOR UPDATE`,
        [partner_id, periodTo])).rows;
      if (!lines.length && !adjustments.length) return null;

      const rates = (await client.query(
        `SELECT commission_pct, finding_fee_paise FROM partner_commission_rates
         WHERE partner_id = $1 AND (effective_until IS NULL OR effective_until >= $2)`, [partner_id, periodTo])).rows[0];
      const commissionPct = rates ? Number(rates.commission_pct) : DEFAULT_COMMISSION_PCT;
      const findingFee = rates ? Number(rates.finding_fee_paise) : DEFAULT_FINDING_FEE_PAISE;

      const adjTaxable = adjustments.reduce((s: number, a: any) => s + Number(a.taxable_paise), 0);
      const adjGst = adjustments.reduce((s: number, a: any) => s + Number(a.gst_paise), 0);
      // Net sales after returns: commission and TCS/TDS are on net value (C-32)
      const taxable = lines.reduce((s: number, l: any) => s + Number(l.line_value_paise || 0), 0) + adjTaxable;
      const gst = lines.reduce((s: number, l: any) => s + Number(l.line_gst_paise || 0), 0) + adjGst;
      const shipments = new Set(lines.map((l: any) => l.shipment_id)).size;
      const r = computeSettlement({
        taxablePaise: taxable, gstCollectedPaise: gst, shipments,
        commissionPct, findingFeePaise: findingFee, feeGstPct, tcsPct, tdsPct,
      });

      const seq = Number((await client.query(
        `SELECT COUNT(*) FROM settlement_batches WHERE to_char(period_to, 'YYYY-MM') = to_char($1::date, 'YYYY-MM')`,
        [periodTo])).rows[0].count) + 1;
      const batchRef = `SETL-${periodTo.slice(0, 7)}-${String(seq).padStart(3, '0')}`;
      const commissionInvoice = (await client.query(`SELECT next_invoice_number('DWS', 'DWS') AS n`)).rows[0].n;

      const b = (await client.query(
        `INSERT INTO settlement_batches
           (batch_ref, partner_id, period_from, period_to, total_orders, gross_sale_value_paise,
            taxable_value_paise, gst_collected_paise, commission_paise, finding_fee_paise, fee_gst_paise,
            tcs_paise, tds_paise, tcs_pct, tds_pct, net_payable_paise, commission_invoice_no, created_by,
            return_deductions_paise)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING id, batch_ref, net_payable_paise`,
        [batchRef, partner_id, periodFrom, periodTo, shipments, r.grossPaise, taxable, gst,
         r.commissionPaise, r.findingFeePaise, r.feeGstPaise, r.tcsPaise, r.tdsPaise, tcsPct, tdsPct,
         r.netPayablePaise, commissionInvoice, createdBy, -(adjTaxable + adjGst)])).rows[0];
      if (adjustments.length) {
        await client.query(`UPDATE settlement_adjustments SET settlement_batch_id = $1 WHERE id = ANY($2::uuid[])`,
          [b.id, adjustments.map((a: any) => a.id)]);
      }

      // Per-line commission for the partner's statement
      await client.query(
        `UPDATE partner_order_items SET settlement_batch_id = $1, settled_at = NOW(),
           commission_pct = $2::numeric, commission_paise = ROUND(line_value_paise * $2::numeric / 100.0)
         WHERE id = ANY($3::uuid[])`, [b.id, commissionPct, lines.map((l: any) => l.id)]);
      await writeAuditTx(client, { userId: null, action: 'settlement_generated', performedBy: createdBy,
        newValue: { batch_id: b.id, batch_ref: b.batch_ref, partner_id, net_payable_paise: b.net_payable_paise } });
      return b;
    });
    if (batch) created.push(batch);
  }
  return { period_from: periodFrom, period_to: periodTo, batches: created };
}

export async function listSettlements(filter: { partnerId?: string; status?: string }) {
  const where: string[] = [];
  const params: any[] = [];
  if (filter.partnerId) { params.push(filter.partnerId); where.push(`sb.partner_id = $${params.length}`); }
  if (filter.status) { params.push(filter.status); where.push(`sb.payment_status = $${params.length}`); }
  return query(
    `SELECT sb.id, sb.batch_ref, sb.partner_id, v.name AS partner_name, sb.period_from, sb.period_to,
            sb.total_orders, sb.gross_sale_value_paise, sb.taxable_value_paise, sb.gst_collected_paise,
            sb.commission_paise, sb.finding_fee_paise, sb.fee_gst_paise, sb.tcs_paise, sb.tds_paise,
            sb.net_payable_paise, sb.commission_invoice_no, sb.payment_status, sb.payment_mode,
            sb.utr_reference, sb.paid_at, sb.created_at
     FROM settlement_batches sb JOIN vendors v ON v.id = sb.partner_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY sb.period_to DESC, v.name LIMIT 500`, params);
}

export async function getSettlement(id: string, partnerId?: string) {
  const [batch] = await listSettlementsById(id, partnerId);
  if (!batch) throw new AppError('Settlement not found', 404);
  const lines = await query(
    `SELECT poi.id, o.order_number, s.invoice_number AS partner_invoice_number, oi.product_name,
            poi.allocated_qty, poi.line_value_paise, poi.line_gst_paise, poi.commission_pct,
            poi.commission_paise, poi.delivered_at
     FROM partner_order_items poi
     JOIN orders o ON o.id = poi.order_id
     JOIN order_items oi ON oi.id = poi.order_item_id
     LEFT JOIN order_shipments s ON s.id = poi.shipment_id
     WHERE poi.settlement_batch_id = $1 ORDER BY poi.delivered_at`, [id]);
  const adjustments = await query(
    `SELECT a.id, a.taxable_paise, a.gst_paise, a.reason, a.created_at, cn.credit_note_number
     FROM settlement_adjustments a LEFT JOIN credit_notes cn ON cn.id = a.credit_note_id
     WHERE a.settlement_batch_id = $1 ORDER BY a.created_at`, [id]);
  return { ...batch, lines, adjustments };
}

async function listSettlementsById(id: string, partnerId?: string) {
  const rows = await query<any>(
    `SELECT sb.*, v.name AS partner_name FROM settlement_batches sb JOIN vendors v ON v.id = sb.partner_id
     WHERE sb.id = $1 ${partnerId ? 'AND sb.partner_id = $2' : ''}`, partnerId ? [id, partnerId] : [id]);
  return rows;
}

export async function markSettlementPaid(id: string, paymentMode: string, utr: string, adminId: string) {
  return withTransaction(async (client) => {
    const b = (await client.query('SELECT payment_status FROM settlement_batches WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!b) throw new AppError('Settlement not found', 404);
    if (b.payment_status === 'paid') throw new AppError('Already paid', 409);
    await client.query(
      `UPDATE settlement_batches SET payment_status = 'paid', payment_mode = $2, utr_reference = $3,
         paid_at = NOW(), paid_by = $4 WHERE id = $1`, [id, paymentMode, utr, adminId]);
    await writeAuditTx(client, { userId: null, action: 'settlement_paid', performedBy: adminId,
      newValue: { batch_id: id, payment_mode: paymentMode, utr } });
    return { id, payment_status: 'paid' };
  });
}

// Previous calendar month, for the scheduled job
export function previousMonth(today = new Date()): { from: string; to: string } {
  const first = new Date(Date.UTC(today.getFullYear(), today.getMonth() - 1, 1));
  const last = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

