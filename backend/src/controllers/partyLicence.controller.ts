// src/controllers/partyLicence.controller.ts — drug licences of partners, suppliers and
// buyer accounts (Sprint 30). Holders see theirs and send renewals / extra licences, which
// wait for an admin's check; admins see every party's licences, check them and open scans.
//   GET/POST /partner/licences, POST /partner/licences/:id/document, GET …/document-url
//   GET/POST /users/me/licences, POST /users/me/licences/:id/document, GET …/document-url
//   GET /admin/party-licences, POST /admin/party-licences/:id/decision, GET …/:id/document-url,
//   POST /admin/party-licences/:id/document, PUT /kyc/admin/applications/:userId/licences
// C-02 licensed suppliers, C-07 licence numbers and validity, C-11 buyer KYC, C-14 expiry,
// C-33 partner eligibility, C-41 private documents (every view logged), C-46 audit.
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { todayIST } from '../utils/ist';
import { writeAuditTx } from '../utils/audit';
import { eligibility, formLabel, licenceLine, licenceProblems, Party, validity } from '../services/licences/forms';
import { licenceList } from '../services/licences/input';
import {
  assertNumbersFree, attachDocument, decideLicence, documentLink, licenceBadge, listLicences, PartyRef, saveCheckedLicencesTx, submitLicencesTx,
} from '../services/licences/register.service';
import { KYCOrchestrator } from '../services/kyc.service';

const uuid = z.string().uuid();
const submitSchema = z.object({ licences: licenceList(10).refine((l) => l.length > 0, 'Enter the licence') });

function buyerParty(customerType: string | null | undefined): Party | null {
  if (customerType === 'b2b_retailer') return 'retailer';
  if (customerType === 'b2b_wholesaler') return 'wholesaler';
  if (customerType === 'doc_hospital') return 'doctor';
  return null;
}

/** What the holder sees: every licence (checked, waiting, rejected), the replaced ones, and what they allow. */
async function holderView(ref: PartyRef, party: Party) {
  const all = await listLicences(ref, { history: true });
  const current = all.filter((l) => l.status !== 'superseded');
  const check = eligibility(current, party, todayIST());
  return {
    licences: current, replaced: all.filter((l) => l.status === 'superseded'),
    licence_line: licenceLine(current.filter((l) => l.status === 'verified')), ...licenceBadge(current),
    can_trade: check.ok, problems: check.reasons, warnings: check.warnings,
  };
}

async function submit(ref: PartyRef, party: Party, actorId: string, body: unknown, audit: { userId: string | null; vendorId?: string }) {
  const d = submitSchema.parse(body);
  const problems = licenceProblems(d.licences, { party, today: todayIST(), requireValidUpto: true, partial: true });
  if (problems.length) throw new AppError(problems.join('. '), 400);
  return withTransaction(async (c) => {
    await assertNumbersFree(c, ref, d.licences, { revealNames: false });
    const ids = await submitLicencesTx(c, ref, d.licences, actorId);
    await writeAuditTx(c, { userId: audit.userId, action: 'licence_submitted', performedBy: actorId,
      newValue: { vendor_id: audit.vendorId ?? null, licence_ids: ids, licences: d.licences.map((l) => ({ form: l.form, number: l.licence_number })) } });
    return ids;
  });
}

// ── Partner portal ───────────────────────────────────────────────────────────
export async function getPartnerLicences(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await holderView({ vendorId: req.partner!.vendorId }, 'partner') }); } catch (e) { next(e); }
}
export async function postPartnerLicences(req: Request, res: Response, next: NextFunction) {
  try {
    const ids = await submit({ vendorId: req.partner!.vendorId }, 'partner', req.user!.id, req.body, { userId: null, vendorId: req.partner!.vendorId });
    res.status(201).json({ success: true, data: { licence_ids: ids, message: 'Sent to Dawabag — the licence counts once our team has checked it' } });
  } catch (e) { next(e); }
}
export async function postPartnerLicenceDocument(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await attachDocument(uuid.parse(req.params.id), { vendorId: req.partner!.vendorId }, req.file, req.user!.id) }); }
  catch (e) { next(e); }
}
export async function getPartnerLicenceDocument(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await documentLink(uuid.parse(req.params.id), { vendorId: req.partner!.vendorId }, req.user!.id) }); }
  catch (e) { next(e); }
}

// ── Buyer account (retailer, wholesaler, doctor / hospital) ──────────────────
async function buyer(req: Request) {
  const u = await queryOne<{ customer_type: string }>(`SELECT customer_type FROM users WHERE id = $1 AND deleted_at IS NULL`, [req.user!.id]);
  const party = buyerParty(u?.customer_type);
  if (!party) throw new AppError('Drug licences are only kept for business and doctor accounts', 400);
  return party;
}
export async function getMyLicences(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await holderView({ userId: req.user!.id }, await buyer(req)) }); } catch (e) { next(e); }
}
export async function postMyLicences(req: Request, res: Response, next: NextFunction) {
  try {
    const party = await buyer(req);
    const ids = await submit({ userId: req.user!.id }, party, req.user!.id, req.body, { userId: req.user!.id });
    res.status(201).json({ success: true, data: { licence_ids: ids, message: 'Sent to Dawabag — the licence counts once our team has checked it' } });
  } catch (e) { next(e); }
}
export async function postMyLicenceDocument(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await attachDocument(uuid.parse(req.params.id), { userId: req.user!.id }, req.file, req.user!.id) }); }
  catch (e) { next(e); }
}
export async function getMyLicenceDocument(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await documentLink(uuid.parse(req.params.id), { userId: req.user!.id }, req.user!.id) }); }
  catch (e) { next(e); }
}

// ── Admin ────────────────────────────────────────────────────────────────────
const MANAGERS = ['admin', 'super_admin'];

/** GET /admin/party-licences?filter=waiting|expiring|expired|all&party=vendor|customer — the work list. */
export async function getPartyLicences(req: Request, res: Response, next: NextFunction) {
  try {
    const f = z.object({
      filter: z.enum(['waiting', 'expiring', 'expired', 'all']).default('waiting'),
      party: z.enum(['vendor', 'customer']).optional(),
    }).parse(req.query);
    const where = [`p.status ${f.filter === 'waiting' ? `= 'pending'` : f.filter === 'all' ? `IN ('pending', 'verified', 'rejected')` : `= 'verified'`}`];
    const params: unknown[] = [];
    if (f.filter === 'expiring') where.push(`p.valid_upto BETWEEN CURRENT_DATE AND CURRENT_DATE + 30`);
    if (f.filter === 'expired') where.push(`p.valid_upto < CURRENT_DATE`);
    if (f.party) { params.push(f.party); where.push(`p.party_type = $${params.length}`); }   // a value: always a parameter
    if (!MANAGERS.includes(req.user!.role)) where.push(`p.party_type = 'customer'`);   // pharmacists check buyer KYC only
    const rows = await query<any>(
      `SELECT p.id, p.party_type, p.vendor_id, p.user_id, p.form, p.form_name, p.licence_number, p.issued_by,
              to_char(p.valid_from, 'YYYY-MM-DD') AS valid_from, to_char(p.valid_upto, 'YYYY-MM-DD') AS valid_upto, p.status,
              p.rejection_reason, (p.document_key IS NOT NULL) AS has_document, p.created_at,
              COALESCE(v.name, u.business_name, up.full_name) AS party_name, COALESCE(v.vendor_type, u.customer_type) AS party_kind
       FROM party_licences p
       LEFT JOIN vendors v ON v.id = p.vendor_id
       LEFT JOIN users u ON u.id = p.user_id
       LEFT JOIN user_profiles up ON up.user_id = p.user_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.valid_upto NULLS FIRST, p.created_at LIMIT 300`, params);
    const today = todayIST();
    res.json({ success: true, data: { licences: rows.map((r) => ({ ...r, label: formLabel(r.form, r.form_name), validity: validity(r.valid_upto, today) })) } });
  } catch (e) { next(e); }
}

const decisionSchema = z.object({
  verified: z.boolean(),
  valid_upto: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the valid-till date').optional().nullable(),
  issued_by: z.string().trim().max(200).optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
});

/** POST /admin/party-licences/:id/decision — verify (with valid-till) or reject (with reason). */
export async function postLicenceDecision(req: Request, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.id);
    const d = decisionSchema.parse(req.body);
    const row = await queryOne<{ vendor_id: string | null }>(`SELECT vendor_id FROM party_licences WHERE id = $1`, [id]);
    if (!row) throw new AppError('Licence not found', 404);
    if (row.vendor_id && !MANAGERS.includes(req.user!.role)) throw new AppError('Partner and supplier licences are checked by an admin', 403);
    const r = await decideLicence(id, req.user!.id, d);
    // A buyer's account opens (or re-opens after renewal) once every check has passed (C-11, C-14)
    const activated = r.userId && d.verified ? await KYCOrchestrator.checkAndActivate(r.userId, req.user!.id) : false;
    res.json({ success: true, data: { licence_id: id, status: d.verified ? 'verified' : 'rejected', account_activated: activated } });
  } catch (e) { next(e); }
}

export async function getAdminLicenceDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.id);
    const row = await queryOne<{ vendor_id: string | null }>(`SELECT vendor_id FROM party_licences WHERE id = $1`, [id]);
    if (row?.vendor_id && !MANAGERS.includes(req.user!.role)) throw new AppError('Partner and supplier licences are for admins', 403);
    res.json({ success: true, data: await documentLink(id, null, req.user!.id) });
  } catch (e) { next(e); }
}

export async function postAdminLicenceDocument(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await attachDocument(uuid.parse(req.params.id), null, req.file, req.user!.id) }); } catch (e) { next(e); }
}

/** PUT /kyc/admin/applications/:userId/licences — the admin enters / corrects a buyer's checked licences. */
export async function putBuyerLicences(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = uuid.parse(req.params.userId);
    const d = z.object({ licences: licenceList(10) }).parse(req.body);
    const u = await queryOne<{ customer_type: string }>(`SELECT customer_type FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]);
    const party = buyerParty(u?.customer_type);
    if (!party) throw new AppError('Drug licences are only kept for business and doctor accounts', 400);
    const problems = licenceProblems(d.licences, { party, today: todayIST(), requireValidUpto: true });
    if (problems.length) throw new AppError(problems.join('. '), 400);
    const saved = await withTransaction(async (c) => {
      await assertNumbersFree(c, { userId }, d.licences);
      const s = await saveCheckedLicencesTx(c, { userId }, d.licences, req.user!.id);
      await writeAuditTx(c, { userId, action: 'licences_entered_by_admin', performedBy: req.user!.id, newValue: s });
      return s;
    });
    const activated = await KYCOrchestrator.checkAndActivate(userId, req.user!.id);
    res.json({ success: true, data: { ...saved, account_activated: activated, licences: await listLicences({ userId }) } });
  } catch (e) { next(e); }
}
