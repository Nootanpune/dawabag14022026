// Signed written orders of doctors and medical institutions (Sprint 44; Drugs Rules 1945
// r.65(9)(b): no supply to a Registered Medical Practitioner without a valid, signed written
// order — FDA Maharashtra (Pune Division) circular No. Drug/Wholesalers Memo./16/2026/1 dated
// 30-09-2026). Two ways (rules.ts):
//   (a) upload — the doctor's signed requisition (PDF / JPEG / PNG), kept in the private
//       object store with its SHA-256;
//   (b) in_app — a requisition built from the cart, signed by the registered doctor's own
//       login: they type their name as on the council's register, tick the declaration and
//       re-enter their password at that moment. Owner decision CONFIRMED 2026-10-04 (Sprint 48):
//       this counts as the signed written order under r.65(9)(b); the upload stays available
//       as an alternative. The exact text, the signer's registration, the time and the address
//       are kept with the hash of the text.
// Either is final once made (database trigger written_orders_final, migration 39) and is
// attached once to the order it authorises (and, for an order change, to that change).
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import PDFDocument from 'pdfkit';
import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../../config/database';
import { getRedis } from '../../config/redis';
import { takeAttempt } from '../../utils/attemptCounter';
import { AppError } from '../../utils/AppError';
import { writeAudit, writeAuditTx } from '../../utils/audit';
import { validateDocument } from '../../utils/documentCheck';
import { formatDateTimeIST } from '../../utils/ist';
import { getPrivateObjectUrl, putPrivateObject } from '../storage.service';
import { signPath } from '../../utils/signedLink';
import { practitionerState } from './registration.service';
import {
  RequisitionItem, WRITTEN_ORDER_REQUIRED, notCovered, requisitionText, typedNameMatches, writtenOrderRequiredMessage,
} from './rules';

export const WRITTEN_ORDER_MAX_BYTES = 5 * 1024 * 1024;
/** A written order is used for an order placed within this many days of signing (developer's choice — confirm). */
export const WRITTEN_ORDER_VALID_DAYS = 30;
const SIGN_WRONG_LIMIT = 5;

type Q = Pick<PoolClient, 'query'>;
interface Meta { ip?: string | null; userAgent?: string | null }

/** The doctor / institution must be verified and in date to sign or upload (the signature carries the registration). */
async function signer(userId: string) {
  const s = await practitionerState(null, userId);
  if (!s.applies) throw new AppError('Written orders are for doctor and medical institution accounts', 403);
  if (!s.standing!.ok) throw new AppError(s.standing!.message, 403, true, 'PRACTITIONER_REGISTRATION_INVALID');
  return s;
}

/** (a) An uploaded signed requisition. */
export async function uploadWrittenOrder(userId: string, file: Express.Multer.File | undefined, meta: Meta) {
  const s = await signer(userId);
  const type = validateDocument(file, { maxBytes: WRITTEN_ORDER_MAX_BYTES, what: 'The written order' });
  const sha = crypto.createHash('sha256').update(file!.buffer).digest('hex');
  const key = `written-orders/${userId}/${uuidv4()}.${type.ext}`;
  await putPrivateObject(key, file!.buffer, type.contentType, { user_id: userId, kind: 'written_order', sha256: sha });
  const row = (await query<any>(
    `INSERT INTO written_orders (user_id, kind, document_key, document_name, document_mime, document_size, document_sha256,
       practitioner, ip_address, user_agent)
     VALUES ($1, 'upload', $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, kind, signed_at`,
    [userId, key, file!.originalname?.slice(0, 255) || null, type.contentType, file!.size, sha, JSON.stringify(s.snapshot),
     meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null]))[0];
  await writeAudit({ userId, action: 'written_order_uploaded', performedBy: userId,
    newValue: { written_order_id: row.id, sha256: sha, size: file!.size } });
  return { id: row.id, kind: row.kind, signed_at: row.signed_at, sha256: sha };
}

/** The products of a requisition, named from the catalogue (never from the request). */
async function requisitionItems(items: { product_id: string; quantity: number }[]): Promise<RequisitionItem[]> {
  if (!items.length) throw new AppError('Add at least one medicine to the requisition', 400);
  const ids = [...new Set(items.map((i) => i.product_id))];
  if (ids.length !== items.length) throw new AppError('Each medicine may appear only once', 400);
  const names = new Map((await query<{ id: string; name: string }>(
    `SELECT id, name FROM products WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`, [ids])).map((p) => [p.id, p.name]));
  return items.map((i) => {
    const name = names.get(i.product_id);
    if (!name) throw new AppError('A medicine on the requisition was not found', 404);
    if (!Number.isInteger(i.quantity) || i.quantity < 1) throw new AppError('Quantities must be whole numbers of at least 1', 400);
    return { product_id: i.product_id, product_name: name, quantity: i.quantity };
  });
}

/** The exact text the doctor will sign (shown before signing). */
export async function previewRequisition(userId: string, items: { product_id: string; quantity: number }[]) {
  const s = await signer(userId);
  const list = await requisitionItems(items);
  return { text: requisitionText(s.snapshot!, list, '(time of signing)'), items: list, name_as_per_register: s.snapshot!.name,
    signature: 'Type your name as on the medical council register, tick the declaration and confirm with your password.' };
}

/** (b) An in-app requisition, signed by the registered doctor's own login. */
export async function signRequisition(userId: string,
  input: { items: { product_id: string; quantity: number }[]; typed_name: string; password: string; declaration: boolean }, meta: Meta) {
  const s = await signer(userId);
  if (input.declaration !== true) throw new AppError('Tick the declaration to sign the written order', 400);
  const list = await requisitionItems(input.items);
  const redis = getRedis();
  const wrongKey = `wo_sign_wrong:${userId}`;
  // Sprint 48 (security review 41–47 #4): this try is counted BEFORE the password is checked
  // (one Redis step), so parallel tries cannot all pass the limit; a right signature clears it
  if (await takeAttempt(redis, wrongKey, 900) > SIGN_WRONG_LIMIT) {
    throw new AppError('Too many wrong attempts. Try signing again in 15 minutes.', 429, true, 'WRITTEN_ORDER_SIGN_PAUSED');
  }
  const u = await queryOne<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1 AND is_active`, [userId]);
  const passwordOk = !!u?.password_hash && await bcrypt.compare(String(input.password ?? ''), u.password_hash);
  if (!passwordOk || !typedNameMatches(input.typed_name, s.snapshot!)) {
    throw new AppError(passwordOk
      ? `Type your name exactly as on the medical council register (${s.snapshot!.name}) to sign.`
      : 'The password is not right. The written order was not signed.', 400, true, 'WRITTEN_ORDER_SIGNATURE_INVALID');
  }
  await redis.del(wrongKey);
  const signedAt = new Date();
  const text = requisitionText(s.snapshot!, list, formatDateTimeIST(signedAt));
  const hash = crypto.createHash('sha256')
    .update(JSON.stringify({ text, typed_name: input.typed_name.trim(), user_id: userId, signed_at: signedAt.toISOString() })).digest('hex');
  const row = (await query<any>(
    `INSERT INTO written_orders (user_id, kind, items, declaration_text, typed_name, signature_method, content_sha256, practitioner,
       signed_at, ip_address, user_agent)
     VALUES ($1, 'in_app', $2, $3, $4, 'password_reauth', $5, $6, $7, $8, $9) RETURNING id, kind, signed_at`,
    [userId, JSON.stringify(list), text, input.typed_name.trim().slice(0, 200), hash, JSON.stringify(s.snapshot), signedAt,
     meta.ip ?? null, meta.userAgent?.slice(0, 300) ?? null]))[0];
  await writeAudit({ userId, action: 'written_order_signed', performedBy: userId,
    newValue: { written_order_id: row.id, content_sha256: hash, items: list.length, method: 'password_reauth' } });
  return { id: row.id, kind: row.kind, signed_at: row.signed_at, content_sha256: hash, text, items: list };
}

/**
 * Inside order placement / an order change: the buyer's own written order, signed within
 * WRITTEN_ORDER_VALID_DAYS, not yet used, and (in-app) covering every line asked for. Linked
 * to the order (and change) in the same transaction; refused (422) otherwise — before any payment.
 */
export async function attachWrittenOrderTx(client: PoolClient, userId: string, writtenOrderId: string | undefined | null,
  target: { orderId: string; orderEditId?: string | null; lines: { product_id: string; product_name: string; quantity: number }[] }) {
  if (!writtenOrderId) throw new AppError(writtenOrderRequiredMessage(), 422, true, WRITTEN_ORDER_REQUIRED);
  const wo = (await client.query(
    `SELECT id, user_id, kind, items, order_id, signed_at FROM written_orders WHERE id = $1 FOR UPDATE`, [writtenOrderId])).rows[0];
  if (!wo || wo.user_id !== userId) throw new AppError('Written order not found', 404);
  if (wo.order_id) throw new AppError('This written order is already used for another order. Sign or upload a new one.', 409, true, 'WRITTEN_ORDER_USED');
  if (Date.now() - new Date(wo.signed_at).getTime() > WRITTEN_ORDER_VALID_DAYS * 864e5) {
    throw new AppError(`This written order is older than ${WRITTEN_ORDER_VALID_DAYS} days. Sign or upload a new one.`, 422, true, 'WRITTEN_ORDER_TOO_OLD');
  }
  const missing = notCovered(wo.kind === 'in_app' ? wo.items : null, target.lines);
  if (missing.length) {
    throw new AppError(`Your signed written order does not cover: ${missing.join(', ')}. Sign a requisition for these medicines and quantities.`,
      422, true, 'WRITTEN_ORDER_NOT_COVERING');
  }
  await client.query(`UPDATE written_orders SET order_id = $2, order_edit_id = $3, attached_at = NOW() WHERE id = $1`,
    [writtenOrderId, target.orderId, target.orderEditId ?? null]);
  await writeAuditTx(client, { userId, action: 'written_order_attached', performedBy: userId,
    newValue: { written_order_id: writtenOrderId, order_id: target.orderId, order_edit_id: target.orderEditId ?? null } });
  return { id: wo.id as string, kind: wo.kind as string };
}

/** The written orders of an order (for the order page, the pharmacist's check and the register). */
export async function writtenOrdersFor(db: Q | null, orderId: string) {
  const sql = `SELECT id, kind, signed_at, attached_at, order_edit_id, typed_name, signature_method, items, document_name,
                      document_sha256, content_sha256, practitioner
               FROM written_orders WHERE order_id = $1 ORDER BY signed_at`;
  const rows = db ? (await db.query(sql, [orderId])).rows : await query<any>(sql, [orderId]);
  return rows.map((r: any) => ({ ...r, practitioner: { ...r.practitioner, certificate_key: undefined, has_certificate: !!r.practitioner?.certificate_key } }));
}

/** May this login see the written order (buyer, staff, or the partner that sells part of its order)? */
async function viewerMay(viewer: { id: string; role: string }, wo: { user_id: string; order_id: string | null }): Promise<boolean> {
  if (wo.user_id === viewer.id) return true;
  if (['admin', 'super_admin', 'pharmacist_rx', 'pharmacist_pack'].includes(viewer.role)) return true;
  if (viewer.role === 'partner' && wo.order_id) {
    return !!(await queryOne(
      `SELECT 1 FROM order_shipments s JOIN vendor_users vu ON vu.vendor_id = s.partner_id
       WHERE s.order_id = $1 AND vu.user_id = $2 LIMIT 1`, [wo.order_id, viewer.id]));
  }
  return false;
}

export async function getWrittenOrder(viewer: { id: string; role: string }, id: string) {
  const wo = await queryOne<any>(
    `SELECT id, user_id, kind, signed_at, attached_at, order_id, order_edit_id, typed_name, signature_method, items, declaration_text,
            document_name, document_mime, document_sha256, content_sha256, practitioner
     FROM written_orders WHERE id = $1`, [id]);
  if (!wo || !(await viewerMay(viewer, wo))) throw new AppError('Written order not found', 404);
  return { ...wo, practitioner: { ...wo.practitioner, certificate_key: undefined, has_certificate: !!wo.practitioner?.certificate_key } };
}

/** The buyer's own written orders not yet used (to pick one at checkout). */
export async function myWrittenOrders(userId: string) {
  return query<any>(
    `SELECT id, kind, signed_at, items, document_name FROM written_orders
     WHERE user_id = $1 AND order_id IS NULL AND signed_at > NOW() - make_interval(days => $2)
     ORDER BY signed_at DESC LIMIT 20`, [userId, WRITTEN_ORDER_VALID_DAYS]);
}

/**
 * A 5-minute link to the written order (every request audited, C-41): the uploaded file in the
 * private object store, or the signed in-app requisition as a PDF made on demand (never stored)
 * behind a signed API path (`pdfPath` = that path, e.g. /api/v1/written-orders/:id/document.pdf).
 */
export async function writtenOrderLink(viewer: { id: string; role: string }, id: string, pdfPath: string): Promise<{ url: string; kind: string }> {
  const wo = await queryOne<any>(`SELECT id, user_id, order_id, kind, document_key FROM written_orders WHERE id = $1`, [id]);
  if (!wo || !(await viewerMay(viewer, wo))) throw new AppError('Written order not found', 404);
  await writeAudit({ userId: wo.user_id, action: 'written_order_viewed', performedBy: viewer.id, newValue: { written_order_id: id } });
  if (wo.kind === 'upload') return { url: await getPrivateObjectUrl(wo.document_key, 300), kind: wo.kind };
  return { url: signPath(pdfPath), kind: wo.kind };
}

/** The in-app requisition as a PDF (caller checked the session or the signed link). */
export async function writtenOrderPdf(viewer: { id: string; role: string } | null, id: string): Promise<{ pdf: Buffer; filename: string }> {
  const wo = await queryOne<any>(`SELECT * FROM written_orders WHERE id = $1`, [id]);
  if (!wo || wo.kind !== 'in_app' || (viewer && !(await viewerMay(viewer, wo)))) throw new AppError('Written order not found', 404);
  return { pdf: await renderRequisitionPdf(wo), filename: `written-order-${String(id).slice(0, 8)}.pdf` };
}

/** The registration certificate copy kept with a sale (from the written order's snapshot). Staff / the selling partner. */
export async function certificateLink(viewer: { id: string; role: string }, writtenOrderId: string) {
  const wo = await queryOne<any>(`SELECT user_id, order_id, practitioner FROM written_orders WHERE id = $1`, [writtenOrderId]);
  if (!wo || !(await viewerMay(viewer, wo))) throw new AppError('Certificate not found', 404);
  const key = wo.practitioner?.certificate_key;
  if (!key) throw new AppError('No certificate copy was recorded with this written order', 404);
  await writeAudit({ userId: wo.user_id, action: 'practitioner_certificate_viewed', performedBy: viewer.id, newValue: { written_order_id: writtenOrderId } });
  return { url: await getPrivateObjectUrl(key, 300) };
}

function renderRequisitionPdf(wo: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font('Helvetica').fontSize(10.5).text(wo.declaration_text, { width: 500 }).moveDown(1.2);
    doc.fontSize(9).fillColor('#444')
      .text(`Typed signature: ${wo.typed_name}`)
      .text(`Signed: ${formatDateTimeIST(wo.signed_at)} by the registered doctor's own login (method: password re-entered at signing)`)
      .text(`Record: ${wo.id} · SHA-256 of the signed text: ${wo.content_sha256}`)
      .moveDown(0.6)
      .text('Kept by Dawabag with the sale record (Drugs Rules 1945, r.65(9)(b); FDA Maharashtra circular Drug/Wholesalers Memo./16/2026/1).');
    doc.end();
  });
}


/** Payment creation re-checks (Sprint 44): a doctor / institution order without its written order is not paid for. */
export async function assertWrittenOrderOnOrder(db: Q, orderId: string): Promise<void> {
  const r = (await db.query(
    `SELECT o.pricing_type, EXISTS (SELECT 1 FROM written_orders w WHERE w.order_id = o.id) AS written FROM orders o WHERE o.id = $1`, [orderId])).rows[0];
  if (r?.pricing_type === 'doc_hospital' && !r.written) throw new AppError(writtenOrderRequiredMessage(), 422, true, WRITTEN_ORDER_REQUIRED);
}
