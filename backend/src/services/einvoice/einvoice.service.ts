// E-invoices (IRN) for Dawabag's own B2B tax invoices and credit notes (C-31).
// A document needs one when e-invoicing is switched on (setting einvoice.enabled,
// once turnover crosses the threshold), Dawabag is the seller and the buyer has a
// GSTIN. Packing creates the pending record; a queue registers it with the IRP;
// dispatch waits for the IRN, because the invoice in the pack must carry it.
// Partners register their own invoices. Corrections are made by credit note.
import Bull from 'bull';
import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../../config/database';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { gstinStateCode, stateCode } from '../../utils/gstStateCodes';
import { getSetting } from '../settings.service';
import { loadCreditNote, loadInvoice } from '../invoiceData.service';
import { generateIrn, irpConfigured, IrpError } from './irp.client';
import { buildIrpPayload, EinvoiceParties, Party } from './payload';

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// ── Which documents need one ─────────────────────────────────────────────────
async function required(client: PoolClient, shipmentId: string): Promise<{ invoice_number: string } | null> {
  if ((await getSetting('einvoice.enabled', false, client)) !== true) return null;
  const s = (await client.query(
    `SELECT s.invoice_number FROM order_shipments s JOIN orders o ON o.id = s.order_id
     WHERE s.id = $1 AND s.seller_type = 'dawabag' AND COALESCE(o.buyer_gstin, '') <> ''`, [shipmentId])).rows[0];
  return s ?? null;
}

// At packing: the invoice's pending e-invoice (none for B2C or partner sales)
export async function ensureInvoiceEinvoice(client: PoolClient, shipmentId: string): Promise<string | null> {
  const s = await required(client, shipmentId);
  if (!s) return null;
  const r = await client.query(
    `INSERT INTO einvoices (doc_type, doc_number, shipment_id) VALUES ('INV', $1, $2)
     ON CONFLICT (shipment_id) WHERE doc_type = 'INV' DO NOTHING RETURNING id`, [s.invoice_number, shipmentId]);
  if (r.rows[0]) { await queueEinvoice(r.rows[0].id); return r.rows[0].id as string; }
  return (await client.query(`SELECT id FROM einvoices WHERE shipment_id = $1 AND doc_type = 'INV'`, [shipmentId])).rows[0].id as string;
}

// With every credit note against an e-invoiced invoice
export async function ensureCreditNoteEinvoice(client: PoolClient, creditNoteId: string, shipmentId: string, number: string) {
  const inv = (await client.query(`SELECT 1 FROM einvoices WHERE shipment_id = $1 AND doc_type = 'INV' AND status <> 'cancelled'`, [shipmentId])).rows[0];
  if (!inv) return null;
  const id = (await client.query(
    `INSERT INTO einvoices (doc_type, doc_number, shipment_id, credit_note_id) VALUES ('CRN', $1, $2, $3) RETURNING id`,
    [number, shipmentId, creditNoteId])).rows[0].id;
  await queueEinvoice(id);
  return id;
}

// Before the dispatch transaction (committed on its own, so a refused dispatch
// does not roll it back): a parcel packed before e-invoicing was switched on
export async function prepareDispatchEinvoice(shipmentId: string) {
  await withTransaction((client) => ensureInvoiceEinvoice(client, shipmentId));
}

// Dispatch gate: the invoice that travels with the goods must carry its IRN
export async function assertEinvoiceReady(client: PoolClient, shipmentId: string) {
  if (!(await required(client, shipmentId))) return;
  const e = (await client.query(`SELECT id, status, error_message FROM einvoices WHERE shipment_id = $1 AND doc_type = 'INV'`, [shipmentId])).rows[0];
  if (e?.status === 'generated') return;
  throw new AppError(e?.status === 'failed'
    ? `E-invoice (IRN) failed: ${e.error_message}. Fix it in Admin → E-invoices, then dispatch`
    : 'E-invoice (IRN) is being registered with the IRP; try dispatch again in a minute', 409);
}

// ── Queue ────────────────────────────────────────────────────────────────────
let queue: Bull.Queue | null = null;
function getQueue() {
  if (!queue) {
    queue = new Bull('einvoice', {
      redis: process.env.REDIS_URL || 'redis://localhost:6379',
      defaultJobOptions: { attempts: 6, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 100, removeOnFail: 100 },
    });
    // A job may run before the creating transaction commits: "not found yet" retries
    queue.process(async (job) => {
      const r = await submitEinvoice(job.data.id);
      if (r === 'retry') throw new Error('IRP temporarily unavailable or record not committed yet');
    });
    queue.on('failed', (job, err) => logger.warn(`E-invoice job ${job.data?.id} attempt failed: ${err.message}`));
  }
  return queue;
}
export async function queueEinvoice(id: string) {
  try { await getQueue().add({ id }, { delay: 1500 }); } catch (e) { logger.error('Could not queue e-invoice', e); }
}
export async function stopEinvoiceQueue() { if (queue) await queue.close().catch(() => undefined); }

// ── Registration ─────────────────────────────────────────────────────────────
async function partiesFor(client: PoolClient, shipmentId: string): Promise<EinvoiceParties> {
  const entity = await getSetting<any>('legal.entity', {}, client);
  const premises = await getSetting<any>('dawabag.premises', {}, client);
  const sellerCity = premises?.pincode
    ? (await client.query(`SELECT city FROM pincode_serviceability WHERE pincode = $1`, [premises.pincode])).rows[0]?.city : null;
  const b = (await client.query(
    `SELECT o.buyer_gstin, u.business_name, up.full_name, a.full_name AS ship_name, concat_ws(', ', a.address_line1, a.address_line2) AS addr,
            a.city, a.state, a.pincode, s.created_at AS invoice_date
     FROM order_shipments s JOIN orders o ON o.id = s.order_id JOIN users u ON u.id = o.user_id
     LEFT JOIN user_profiles up ON up.user_id = o.user_id JOIN addresses a ON a.id = o.address_id WHERE s.id = $1`, [shipmentId])).rows[0];
  const seller: Party = { gstin: entity?.gstin ?? '', legalName: entity?.name ?? '', address1: entity?.address ?? '',
    location: sellerCity ?? '', pincode: premises?.pincode ?? '', stateCode: gstinStateCode(entity?.gstin) ?? '' };
  const buyer: Party = { gstin: b.buyer_gstin, legalName: b.business_name || b.full_name || b.ship_name, address1: b.addr,
    location: b.city, pincode: b.pincode, stateCode: gstinStateCode(b.buyer_gstin) ?? '' };
  const problems: string[] = [];
  if (!GSTIN.test(seller.gstin)) problems.push("Dawabag's GSTIN (Admin → Settings → legal entity)");
  if (!seller.legalName || !seller.address1) problems.push("Dawabag's legal name and address (legal entity)");
  if (!/^\d{6}$/.test(seller.pincode) || !seller.location) problems.push('premises PIN code with a serviceable city (dawabag.premises)');
  if (!GSTIN.test(buyer.gstin)) problems.push(`buyer GSTIN "${buyer.gstin}"`);
  if (!/^\d{6}$/.test(String(buyer.pincode))) problems.push('buyer PIN code');
  if (problems.length) throw new IrpError('DATA', `Missing or invalid: ${problems.join('; ')}`);
  return { seller, buyer, placeOfSupply: stateCode(b.state) ?? buyer.stateCode, originalInvoiceDate: b.invoice_date };
}

// Registers one document. 'done' | 'failed' (needs a person) | 'retry' (queue tries again)
export async function submitEinvoice(id: string): Promise<'done' | 'failed' | 'retry'> {
  return withTransaction(async (client) => {
    const e = (await client.query(`SELECT * FROM einvoices WHERE id = $1 FOR UPDATE SKIP LOCKED`, [id])).rows[0];
    if (!e) return 'retry';                                   // not committed yet, or another worker has it
    if (e.status !== 'pending') return 'done';
    const fail = async (err: IrpError | Error, transient: boolean) => {
      const code = err instanceof IrpError ? err.code : 'ERROR';
      await client.query(
        `UPDATE einvoices SET status = $2, error_code = $3, error_message = $4, attempts = attempts + 1, last_attempt_at = NOW() WHERE id = $1`,
        [id, transient ? 'pending' : 'failed', code, err.message.slice(0, 1000)]);
      return transient ? 'retry' as const : 'failed' as const;
    };
    if (!irpConfigured()) return fail(new IrpError('CONFIG', 'IRP credentials are not set (IRP_* environment)'), false);
    if (e.doc_type === 'CRN') {
      const inv = (await client.query(`SELECT status FROM einvoices WHERE shipment_id = $1 AND doc_type = 'INV'`, [e.shipment_id])).rows[0];
      if (inv?.status !== 'generated') return fail(new IrpError('WAIT', 'Waiting for the original invoice IRN'), true);
    }
    try {
      const doc = e.doc_type === 'INV' ? await loadInvoice(e.shipment_id) : await loadCreditNote(e.credit_note_id);
      const parties = await partiesFor(client, e.shipment_id);
      const r = await generateIrn(parties.seller.gstin, buildIrpPayload(doc, parties));
      const ack = Date.parse(String(r.AckDt).replace(' ', 'T') + '+05:30');
      await client.query(
        `UPDATE einvoices SET status = 'generated', irn = $2, ack_no = $3, ack_date = $4, signed_qr = $5, signed_invoice = $6,
           error_code = NULL, error_message = NULL, attempts = attempts + 1, last_attempt_at = NOW(), generated_at = NOW() WHERE id = $1`,
        [id, r.Irn, String(r.AckNo), Number.isNaN(ack) ? new Date() : new Date(ack), r.SignedQRCode ?? null, r.SignedInvoice ?? null]);
      await writeAuditTx(client, { userId: null, action: 'einvoice_generated', performedBy: null,
        newValue: { einvoice_id: id, doc_type: e.doc_type, doc_number: e.doc_number, irn: r.Irn } });
      return 'done';
    } catch (err: any) {
      if (err instanceof IrpError) return fail(err, err.transient);
      throw err;
    }
  });
}

// ── Admin ────────────────────────────────────────────────────────────────────
const LIST = `SELECT e.id, e.doc_type, e.doc_number, e.status, e.irn, e.ack_no, e.ack_date, e.error_code, e.error_message,
                     e.attempts, e.last_attempt_at, e.created_at, e.shipment_id, e.credit_note_id, o.order_number, o.id AS order_id, o.buyer_gstin
              FROM einvoices e JOIN order_shipments s ON s.id = e.shipment_id JOIN orders o ON o.id = s.order_id`;

export async function listEinvoices(status?: string) {
  const rows = await query(`${LIST} ${status ? 'WHERE e.status = $1' : ''} ORDER BY e.created_at DESC LIMIT 300`, status ? [status] : []);
  const counts = await query(`SELECT status, COUNT(*)::int AS n FROM einvoices GROUP BY status`);
  return { einvoices: rows, counts: Object.fromEntries(counts.map((c: any) => [c.status, c.n])), enabled: (await getSetting('einvoice.enabled', false)) === true };
}

// After fixing the data (GSTIN, PIN code, settings): try again now
export async function retryEinvoice(userId: string, id: string) {
  await withTransaction(async (client) => {
    const e = (await client.query(`SELECT status FROM einvoices WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!e) throw new AppError('E-invoice not found', 404);
    if (e.status === 'generated') throw new AppError('Already registered', 409);
    await client.query(`UPDATE einvoices SET status = 'pending' WHERE id = $1`, [id]);
    await writeAuditTx(client, { userId: null, action: 'einvoice_retry', performedBy: userId, newValue: { einvoice_id: id } });
  });
  const result = await submitEinvoice(id);
  if (result === 'retry') await queueEinvoice(id);
  return queryOne(`${LIST} WHERE e.id = $1`, [id]);
}

// Scheduled sweep: anything pending whose queue job was lost
export async function runEinvoiceSweep() {
  const rows = await query<{ id: string }>(
    `SELECT id FROM einvoices WHERE status = 'pending' AND COALESCE(last_attempt_at, created_at) < NOW() - INTERVAL '10 minutes' LIMIT 200`);
  for (const r of rows) await queueEinvoice(r.id);
  return { requeued: rows.length };
}
