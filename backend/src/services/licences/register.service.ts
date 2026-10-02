// The drug licence register for every party (Sprint 30): marketplace partners and
// suppliers (vendors) and buyer accounts (retailers, wholesalers, doctors/hospitals).
// One table, party_licences; a database trigger keeps the single-licence summary on
// vendors / users (number, form, EARLIEST valid-till of the checked licences) that every
// existing check reads (C-02, C-11, C-14, C-33). Rules are in forms.ts.
//   Checked licences ('verified') are entered or approved by an admin; a buyer's or a
//   partner's own entry waits as 'pending' until an admin verifies it, and the licence
//   it renews is then kept as 'superseded' (C-07, C-46: nothing is edited away).
import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAudit, writeAuditTx } from '../../utils/audit';
import { todayIST } from '../../utils/ist';
import { validateDocument } from '../../utils/documentCheck';
import { getPrivateObjectUrl, isObjectStoreConfigured, putPrivateObject } from '../storage.service';
import {
  DAWABAG_DRUG_TYPES, eligibility, FORM_ORDER, formLabel, LicenceForm, LicenceIn, numberKey, Party, validity,
} from './forms';

export type PartyRef = { vendorId: string; userId?: undefined } | { userId: string; vendorId?: undefined };
/** A party being created in this transaction (no id yet). */
export type NewParty = { newParty: 'vendor' | 'user'; gstin?: string | null };

export interface LicenceRow {
  id: string | null;            // null = the old single licence on file, not yet in the register
  form: LicenceForm;
  form_name: string | null;
  label: string;
  licence_number: string;
  issued_by: string | null;
  valid_from: string | null;
  valid_upto: string | null;
  status: 'pending' | 'verified' | 'rejected' | 'superseded';
  validity: ReturnType<typeof validity>;
  rejection_reason: string | null;
  has_document: boolean;
  verified_at: string | null;
  created_at: string | null;
}

const COLUMNS = `id, form, form_name, licence_number, issued_by, to_char(valid_from, 'YYYY-MM-DD') AS valid_from,
  to_char(valid_upto, 'YYYY-MM-DD') AS valid_upto, status, rejection_reason, (document_key IS NOT NULL) AS has_document,
  verified_at, created_at`;
const ORDER = `ORDER BY CASE status WHEN 'verified' THEN 0 WHEN 'pending' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,
  licence_form_rank(form), created_at`;

const partyWhere = (ref: PartyRef, n = 1) => (ref.vendorId ? `vendor_id = $${n}` : `user_id = $${n}`);
const partyId = (ref: PartyRef) => (ref.vendorId ?? ref.userId) as string;

function shape(r: any, today: string): LicenceRow {
  return { ...r, label: formLabel(r.form, r.form_name), validity: validity(r.valid_upto, today) };
}

type Q = Pick<PoolClient, 'query'>;
const run = async <T = any>(c: Q | null, sql: string, params: unknown[]) =>
  (c ? (await c.query(sql, params)).rows : await query(sql, params)) as T[];

/**
 * The party's licences: checked first, then waiting, rejected and replaced ones
 * (history). A party added before Sprint 30 straight into the old single columns
 * (and not yet in the register) shows that one licence, so nothing on file is hidden.
 */
export async function listLicences(ref: PartyRef, opts: { history?: boolean; client?: Q } = {}): Promise<LicenceRow[]> {
  const today = todayIST();
  const rows = await run(opts.client ?? null,
    `SELECT ${COLUMNS} FROM party_licences WHERE ${partyWhere(ref)} ${opts.history ? '' : `AND status IN ('verified', 'pending', 'rejected')`} ${ORDER}`,
    [partyId(ref)]);
  if (rows.length) return rows.map((r) => shape(r, today));
  const legacy = (await run(opts.client ?? null, ref.vendorId
    ? `SELECT drug_license_no AS licence_number, drug_license_type AS form, to_char(drug_license_expiry, 'YYYY-MM-DD') AS valid_upto,
              COALESCE(drug_license_verified, FALSE) OR approval_status = 'approved' AS checked
       FROM vendors WHERE id = $1`
    : `SELECT drug_license_number AS licence_number, drug_license_type AS form, to_char(drug_license_expiry, 'YYYY-MM-DD') AS valid_upto,
              COALESCE(drug_license_verified, FALSE) AS checked
       FROM users WHERE id = $1`, [partyId(ref)]))[0];
  if (!legacy?.licence_number) return [];
  const known = FORM_ORDER.includes(legacy.form);
  return [shape({
    id: null, form: known ? legacy.form : 'other', form_name: known ? null : 'Drug licence (form not recorded)',
    licence_number: legacy.licence_number, issued_by: null, valid_from: null, valid_upto: legacy.valid_upto,
    status: legacy.checked ? 'verified' : 'pending', rejection_reason: null, has_document: false, verified_at: null, created_at: null,
  }, today)];
}

/** Checked + waiting licences of many parties at once (lists). */
export async function licencesByParty(kind: 'vendor' | 'user', ids: string[]): Promise<Map<string, LicenceRow[]>> {
  const out = new Map<string, LicenceRow[]>();
  if (!ids.length) return out;
  const col = kind === 'vendor' ? 'vendor_id' : 'user_id';
  const today = todayIST();
  const rows = await query<any>(
    `SELECT ${col} AS party_id, ${COLUMNS} FROM party_licences WHERE ${col} = ANY($1) AND status IN ('verified', 'pending') ${ORDER}`, [ids]);
  for (const r of rows) {
    const list = out.get(r.party_id) ?? [];
    list.push(shape(r, today));
    out.set(r.party_id, list);
  }
  return out;
}

/** Count, earliest valid-till and a warning level for admin lists (≤ 30 days or expired). */
export function licenceBadge(rows: LicenceRow[]) {
  const checked = rows.filter((r) => r.status === 'verified');
  const dates = checked.map((r) => r.valid_upto).filter((d): d is string => !!d).sort();
  const earliest = dates[0] ?? null;
  const level = validity(earliest, todayIST());
  return {
    licence_count: checked.length,
    pending_count: rows.filter((r) => r.status === 'pending').length,
    earliest_expiry: earliest,
    expiry_warning: level === 'expired' ? 'expired' : level === 'expiring' ? 'expiring' : null,
  };
}

// ── Duplicate numbers ────────────────────────────────────────────────────────
/**
 * A licence number belongs to one party. The same number on two forms of ONE party is
 * fine (some states print one number for Form 20 and 21); on another party it is
 * refused with a plain message. Exception: a partner/supplier and a buyer account of the
 * SAME business (same GSTIN) — e.g. a partner pharmacy that also buys from Dawabag.
 * Dawabag's own register (business_licences) is checked too.
 */
export async function assertNumbersFree(c: Q, ref: PartyRef | NewParty, licences: Pick<LicenceIn, 'form' | 'form_name' | 'licence_number'>[],
  opts: { revealNames: boolean } = { revealNames: true }) {
  const keys = [...new Set(licences.map((l) => numberKey(l.licence_number)).filter((k) => k.length >= 3))];
  if (!keys.length) return;
  const isNew = 'newParty' in ref;
  const asVendor = isNew ? ref.newParty === 'vendor' : !!(ref as PartyRef).vendorId;
  const existing = isNew ? null : (ref as PartyRef);
  const me = isNew ? { gstin: ref.gstin ?? null } : existing!.vendorId
    ? (await c.query(`SELECT gst_number AS gstin FROM vendors WHERE id = $1`, [existing!.vendorId])).rows[0]
    : (await c.query(`SELECT gstin FROM users WHERE id = $1`, [existing!.userId])).rows[0];
  const myGstin: string | null = me?.gstin || null;
  const others = (await c.query(
    `SELECT p.number_key, p.licence_number, 'vendor' AS kind, v.name, v.gst_number AS gstin
       FROM party_licences p JOIN vendors v ON v.id = p.vendor_id
      WHERE p.number_key = ANY($1) AND p.status IN ('verified', 'pending') AND p.vendor_id IS DISTINCT FROM $2
     UNION ALL
     SELECT p.number_key, p.licence_number, 'user', COALESCE(u.business_name, 'another Dawabag account'), u.gstin
       FROM party_licences p JOIN users u ON u.id = p.user_id
      WHERE p.number_key = ANY($1) AND p.status IN ('verified', 'pending') AND p.user_id IS DISTINCT FROM $3 AND u.deleted_at IS NULL
     UNION ALL
     SELECT upper(regexp_replace(v.drug_license_no, '[^A-Za-z0-9]', '', 'g')), v.drug_license_no, 'vendor', v.name, v.gst_number
       FROM vendors v
      WHERE upper(regexp_replace(v.drug_license_no, '[^A-Za-z0-9]', '', 'g')) = ANY($1) AND v.id IS DISTINCT FROM $2
        AND NOT EXISTS (SELECT 1 FROM party_licences p WHERE p.vendor_id = v.id)
     UNION ALL
     SELECT upper(regexp_replace(b.licence_number, '[^A-Za-z0-9]', '', 'g')), b.licence_number, 'dawabag', 'Dawabag', NULL
       FROM business_licences b
      WHERE b.is_active AND upper(regexp_replace(b.licence_number, '[^A-Za-z0-9]', '', 'g')) = ANY($1)`,
    [keys, existing?.vendorId ?? null, existing?.userId ?? null])).rows;
  for (const o of others) {
    const sameBusiness = !!myGstin && !!o.gstin && o.gstin === myGstin && o.kind !== 'dawabag'
      && (o.kind === 'vendor') !== asVendor;   // a vendor and a buyer account of one business
    if (sameBusiness) continue;
    const l = licences.find((x) => numberKey(x.licence_number) === o.number_key)!;
    const who = o.kind === 'dawabag' ? 'Dawabag itself'
      : opts.revealNames ? o.name : 'another business on Dawabag';
    throw new AppError(`${formLabel(l.form, l.form_name)} number ${l.licence_number.trim()} is already registered to ${who}. `
      + 'A licence number belongs to one business — check the number on the licence.', 409);
  }
}

// ── Saving ───────────────────────────────────────────────────────────────────
const formKey = (l: Pick<LicenceIn, 'form' | 'form_name'>) => `${l.form}|${l.form === 'other' ? (l.form_name ?? '').trim().toUpperCase() : ''}`;
const clean = (l: LicenceIn) => ({
  form: l.form, form_name: l.form === 'other' ? (l.form_name ?? '').trim() : null,
  licence_number: l.licence_number.trim(), issued_by: l.issued_by?.trim() || null,
  valid_from: l.valid_from || null, valid_upto: l.valid_upto || null,
});

/**
 * An admin's full list of CHECKED licences for a party (partner, supplier, or a buyer in
 * KYC review). Forms no longer listed are kept as 'superseded'; a waiting entry for a
 * form the admin has now entered is superseded too. Returns what changed for the audit.
 */
export async function saveCheckedLicencesTx(c: PoolClient, ref: PartyRef, licences: LicenceIn[], actorId: string) {
  const id = partyId(ref);
  const col = ref.vendorId ? 'vendor_id' : 'user_id';
  const current = (await c.query(`SELECT id, form, form_name, licence_number, valid_upto, valid_from, issued_by, status
                                  FROM party_licences WHERE ${col} = $1 AND status IN ('verified', 'pending') FOR UPDATE`, [id])).rows;
  const wanted = new Map(licences.map((l) => [formKey(l), clean(l)]));
  const removed: string[] = [];
  for (const row of current) {
    const keep = wanted.get(formKey(row));
    if (row.status === 'verified' && !keep) {
      await c.query(`UPDATE party_licences SET status = 'superseded', updated_at = NOW() WHERE id = $1`, [row.id]);
      removed.push(formLabel(row.form, row.form_name));
    } else if (row.status === 'pending' && keep) {
      await c.query(`UPDATE party_licences SET status = 'superseded', updated_at = NOW() WHERE id = $1`, [row.id]);
    }
  }
  for (const l of wanted.values()) {
    const existing = current.find((r) => r.status === 'verified' && formKey(r) === formKey(l));
    if (existing) {
      await c.query(
        `UPDATE party_licences SET licence_number = $2, issued_by = $3, valid_from = $4, valid_upto = $5, form_name = $6,
                verified_by = $7, verified_at = NOW(), updated_at = NOW(),
                last_alert_days = CASE WHEN valid_upto IS DISTINCT FROM $5::date THEN NULL ELSE last_alert_days END
         WHERE id = $1`, [existing.id, l.licence_number, l.issued_by, l.valid_from, l.valid_upto, l.form_name, actorId]);
    } else {
      await c.query(
        `INSERT INTO party_licences (${col}, form, form_name, licence_number, issued_by, valid_from, valid_upto, status,
                                     verified_by, verified_at, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'verified', $8, NOW(), $8)`,
        [id, l.form, l.form_name, l.licence_number, l.issued_by, l.valid_from, l.valid_upto, actorId]);
    }
  }
  return { saved: [...wanted.values()].map((l) => ({ form: l.form, form_name: l.form_name, number: l.licence_number, valid_upto: l.valid_upto })), removed };
}

/**
 * A buyer's or partner's own licences (at sign-up, a new form, or a renewal): each is
 * stored WAITING for an admin's check. A waiting entry of the same form is replaced; a
 * checked licence is never changed by its holder.
 */
export async function submitLicencesTx(c: PoolClient, ref: PartyRef, licences: LicenceIn[], actorId: string) {
  const id = partyId(ref);
  const col = ref.vendorId ? 'vendor_id' : 'user_id';
  const ids: string[] = [];
  for (const raw of licences) {
    const l = clean(raw);
    const pending = (await c.query(
      `SELECT id FROM party_licences WHERE ${col} = $1 AND status = 'pending' AND form = $2
         AND upper(coalesce(form_name, '')) = upper(coalesce($3, '')) FOR UPDATE`, [id, l.form, l.form_name])).rows[0];
    if (pending) {
      await c.query(
        `UPDATE party_licences SET licence_number = $2, issued_by = $3, valid_from = $4, valid_upto = $5, rejection_reason = NULL,
                updated_at = NOW() WHERE id = $1`, [pending.id, l.licence_number, l.issued_by, l.valid_from, l.valid_upto]);
      ids.push(pending.id);
    } else {
      ids.push((await c.query(
        `INSERT INTO party_licences (${col}, form, form_name, licence_number, issued_by, valid_from, valid_upto, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8) RETURNING id`,
        [id, l.form, l.form_name, l.licence_number, l.issued_by, l.valid_from, l.valid_upto, actorId])).rows[0].id);
    }
  }
  return ids;
}

export interface Decision { verified: boolean; valid_upto?: string | null; issued_by?: string | null; reason?: string | null }

/**
 * An admin checks one waiting licence against the licensing authority's record. Verified:
 * needs a valid-till date in the future; the checked licence of the same form it renews
 * becomes 'superseded'. Rejected: kept with the reason the holder sees.
 */
export async function decideLicenceTx(c: PoolClient, licenceId: string, adminId: string, d: Decision) {
  const row = (await c.query(`SELECT * FROM party_licences WHERE id = $1 FOR UPDATE`, [licenceId])).rows[0];
  if (!row) throw new AppError('Licence not found', 404);
  if (!['pending', 'verified', 'rejected'].includes(row.status)) throw new AppError('This licence has been replaced; open the current one', 409);
  const label = formLabel(row.form, row.form_name);
  if (d.verified) {
    const upto = d.valid_upto || (row.valid_upto ? new Date(row.valid_upto).toISOString().slice(0, 10) : null);
    if (!upto) throw new AppError(`${label}: enter the valid-till date printed on the licence`, 400);
    if (upto < todayIST()) throw new AppError(`${label} expired on ${upto}; it cannot be verified — ask for the renewed licence`, 400);
    await c.query(
      `UPDATE party_licences SET status = 'superseded', updated_at = NOW()
       WHERE id <> $1 AND status = 'verified' AND form = $2 AND upper(coalesce(form_name, '')) = upper(coalesce($3, ''))
         AND (vendor_id = $4 OR user_id = $5)`, [row.id, row.form, row.form_name, row.vendor_id, row.user_id]);
    await c.query(
      `UPDATE party_licences SET status = 'verified', valid_upto = $2, issued_by = COALESCE($3, issued_by), rejection_reason = NULL,
              verified_by = $4, verified_at = NOW(), last_alert_days = NULL, updated_at = NOW() WHERE id = $1`,
      [row.id, upto, d.issued_by?.trim() || null, adminId]);
  } else {
    if (!d.reason || d.reason.trim().length < 3) throw new AppError('Give the reason the licence is not accepted', 400);
    await c.query(
      `UPDATE party_licences SET status = 'rejected', rejection_reason = $2, verified_by = $3, verified_at = NOW(), updated_at = NOW()
       WHERE id = $1`, [row.id, d.reason.trim(), adminId]);
  }
  await writeAuditTx(c, { userId: row.user_id ?? null, action: d.verified ? 'licence_verified' : 'licence_rejected', performedBy: adminId,
    newValue: { licence_id: row.id, vendor_id: row.vendor_id, form: row.form, number: row.licence_number }, notes: d.reason ?? null });
  return { vendorId: row.vendor_id as string | null, userId: row.user_id as string | null, label, number: row.licence_number as string };
}

export const decideLicence = (licenceId: string, adminId: string, d: Decision) =>
  withTransaction((c) => decideLicenceTx(c, licenceId, adminId, d));

// ── Licence scans (private object store, like KYC documents; C-41) ───────────
/**
 * Whether the holder owns this licence row: a partner its vendor's licences, a buyer
 * account its own. Security review Sprint 34 (High): the earlier check compared both
 * columns with "!==" and "&&", so a buyer matched any other buyer's licence (both
 * vendor_id NULL) and a partner any other partner's — scans could be read and replaced.
 */
export function ownsLicence(row: { vendor_id: string | null; user_id: string | null }, owner: PartyRef): boolean {
  if (owner.vendorId) return !!row.vendor_id && row.vendor_id === owner.vendorId;
  if (owner.userId) return !!row.user_id && row.user_id === owner.userId;
  return false;
}

export const LICENCE_FILE_MAX_BYTES = 5 * 1024 * 1024;

export async function attachDocument(licenceId: string, owner: PartyRef | null, file: Express.Multer.File | undefined, actorId: string) {
  if (!file) throw new AppError('No file uploaded', 400);
  // Type from the file's own bytes, matching what was declared (security review Sprint 34)
  const { ext, contentType } = validateDocument(file, { maxBytes: LICENCE_FILE_MAX_BYTES, what: 'File' });
  const row = await queryOne<any>(`SELECT id, vendor_id, user_id, status FROM party_licences WHERE id = $1`, [licenceId]);
  if (!row || (owner && !ownsLicence(row, owner))) throw new AppError('Licence not found', 404);
  if (owner && row.status !== 'pending') throw new AppError('A checked licence cannot be changed; send the renewed licence instead', 409);
  if (!isObjectStoreConfigured()) throw new AppError('Document storage is not configured on this server', 503);
  const key = `licences/${row.vendor_id ? `vendor/${row.vendor_id}` : `user/${row.user_id}`}/${licenceId}/${uuidv4()}.${ext}`;
  await putPrivateObject(key, file.buffer, contentType, { licence_id: licenceId, uploaded_at: new Date().toISOString() });
  await query(
    `UPDATE party_licences SET document_key = $2, document_name = $3, document_mime = $4, document_size = $5, updated_at = NOW() WHERE id = $1`,
    [licenceId, key, file.originalname?.slice(0, 255) || null, contentType, file.size]);
  await writeAudit({ userId: row.user_id ?? null, action: 'licence_document_uploaded', performedBy: actorId,
    newValue: { licence_id: licenceId, vendor_id: row.vendor_id } });
  return { licence_id: licenceId, has_document: true };
}

/** 5-minute link to a licence scan; every view is logged (C-41). */
export async function documentLink(licenceId: string, owner: PartyRef | null, viewerId: string) {
  const row = await queryOne<any>(`SELECT vendor_id, user_id, document_key FROM party_licences WHERE id = $1`, [licenceId]);
  if (!row || (owner && !ownsLicence(row, owner))) throw new AppError('Licence not found', 404);
  if (!row.document_key) throw new AppError('No document was uploaded for this licence', 404);
  if (!isObjectStoreConfigured()) throw new AppError('Document storage is not configured on this server', 503);
  const url = await getPrivateObjectUrl(row.document_key, 300);
  await writeAudit({ userId: row.user_id ?? null, action: 'licence_document_viewed', performedBy: viewerId,
    newValue: { licence_id: licenceId, vendor_id: row.vendor_id } });
  return { url, expires_in: 300 };
}

// ── Eligibility from ALL licences ────────────────────────────────────────────
export async function partyEligibility(ref: PartyRef, party: Party, client?: Q) {
  const rows = await listLicences(ref, { client });
  return eligibility(rows, party, todayIST());
}

// ── Dawabag's own drug licences (business_licences is the authority, C-07) ───
export interface DawabagLicence { form: LicenceForm; label: string; licence_number: string; valid_upto: string | null; validity: string }

export async function dawabagDrugLicences(client?: Q): Promise<DawabagLicence[]> {
  const rows = await run(client ?? null,
    `SELECT licence_type, licence_number, to_char(valid_upto, 'YYYY-MM-DD') AS valid_upto
     FROM business_licences WHERE is_active AND licence_type = ANY($1) ORDER BY licence_type, licence_number`,
    [Object.keys(DAWABAG_DRUG_TYPES)]);
  const today = todayIST();
  return rows.map((r: any) => {
    const form = DAWABAG_DRUG_TYPES[r.licence_type];
    return { form, label: formLabel(form), licence_number: r.licence_number, valid_upto: r.valid_upto, validity: validity(r.valid_upto, today) };
  }).sort((a, b) => FORM_ORDER.indexOf(a.form) - FORM_ORDER.indexOf(b.form));
}

/** Snapshot printed on an invoice: [{form, label, number, valid_upto}] (C-13). */
export const snapshot = (rows: { form: string; form_name?: string | null; label?: string; licence_number: string; valid_upto: string | null }[]) =>
  rows.map((r) => ({ form: r.form, label: r.label ?? formLabel(r.form, r.form_name), number: r.licence_number, valid_upto: r.valid_upto }));
