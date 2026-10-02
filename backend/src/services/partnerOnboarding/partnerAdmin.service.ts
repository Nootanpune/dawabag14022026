// Dawabag's admin onboards and edits a marketplace partner directly (Sprint 28):
// one transaction creates the partner (approved, as the admin has checked its GST
// registration and licences), its drug licences, its registered pharmacists and its
// portal logins with temporary passwords. Rules live in rules.ts; logins in logins.ts.
//   C-02 / C-07 licences with numbers and validity · C-03 registered pharmacist
//   C-32 / C-33 partner GSTIN, licence and invoice series · C-46 audit trail
import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { checkGstin, gstinStateProblem } from '../../utils/gstin';
import { todayIST } from '../../utils/ist';
import { addPartnerLoginTx, LoginIn, LoginOut } from './logins';
import {
  invoicePrefixProblem, LICENCE_LABEL, LicenceIn, licenceProblems, licenceSummary, PharmacistIn, pharmacistProblems, sellingRights,
} from './rules';

export interface PartnerDetailsIn {
  legal_name: string;
  trade_name?: string | null;
  gstin: string;
  contact_name: string;
  contact_mobile: string;
  contact_email?: string | null;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  latitude?: number | null;
  longitude?: number | null;
  invoice_prefix: string;
}
export interface CreatePartnerIn extends PartnerDetailsIn {
  licences: LicenceIn[];
  pharmacists: PharmacistIn[];
  logins: LoginIn[];
}
export type UpdatePartnerIn = Partial<PartnerDetailsIn> & { licences?: LicenceIn[]; pharmacists?: PharmacistIn[] };

const fail = (problems: string[]) => {
  if (problems.length) throw new AppError(problems.join('. '), 400);
};

/** GSTIN format, check character and state of the address (C-33). Returns the clean GSTIN. */
function checkedGstin(gstin: string, state: string): string {
  const g = checkGstin(gstin);
  if (!g.ok) throw new AppError(g.reason, 400);
  const stateProblem = gstinStateProblem(g.gstin, state);
  if (stateProblem) throw new AppError(stateProblem, 400);
  return g.gstin;
}

/** Nobody else may hold the invoice prefix, the GSTIN (as a partner) or a licence number. */
async function assertUnique(c: PoolClient, vendorId: string | null, d: { invoice_prefix?: string; gstin?: string; licences?: LicenceIn[] }) {
  if (d.invoice_prefix) {
    const other = (await c.query(`SELECT name FROM vendors WHERE invoice_prefix = $1 AND id IS DISTINCT FROM $2`, [d.invoice_prefix, vendorId])).rows[0];
    if (other) throw new AppError(`Invoice prefix ${d.invoice_prefix} is already used by ${other.name}; choose another`, 409);
  }
  if (d.gstin) {
    const other = (await c.query(
      `SELECT name FROM vendors WHERE gst_number = $1 AND vendor_type IN ('marketplace_partner', 'both') AND id IS DISTINCT FROM $2`,
      [d.gstin, vendorId])).rows[0];
    if (other) throw new AppError(`A partner with GSTIN ${d.gstin} already exists (${other.name}); open it and edit it instead`, 409);
  }
  for (const l of d.licences ?? []) {
    const n = l.licence_number.trim();
    const other = (await c.query(
      `SELECT v.name FROM vendor_licences vl JOIN vendors v ON v.id = vl.vendor_id
       WHERE vl.licence_type = $1 AND vl.licence_number = $2 AND vl.vendor_id IS DISTINCT FROM $3
       UNION ALL SELECT name FROM vendors WHERE drug_license_no = $2 AND id IS DISTINCT FROM $3 LIMIT 1`,
      [l.licence_type, n, vendorId])).rows[0];
    if (other) throw new AppError(`${LICENCE_LABEL[l.licence_type]} number ${n} is already registered to ${other.name}`, 409);
  }
}

/** Where the partner is, for nearest-seller allocation: given, else the PIN's centre. */
async function location(c: PoolClient, d: Pick<PartnerDetailsIn, 'pincode' | 'latitude' | 'longitude'>) {
  if (d.latitude != null && d.longitude != null) return { latitude: d.latitude, longitude: d.longitude };
  const pin = (await c.query(`SELECT latitude, longitude FROM pincode_serviceability WHERE pincode = $1`, [d.pincode])).rows[0];
  return { latitude: pin?.latitude ?? null, longitude: pin?.longitude ?? null };
}

async function saveLicencesTx(c: PoolClient, vendorId: string, adminId: string, licences: LicenceIn[]) {
  await c.query(`DELETE FROM vendor_licences WHERE vendor_id = $1 AND licence_type <> ALL($2)`, [vendorId, licences.map((l) => l.licence_type)]);
  for (const l of licences) {
    await c.query(
      `INSERT INTO vendor_licences (vendor_id, licence_type, licence_number, valid_upto, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (vendor_id, licence_type) DO UPDATE SET licence_number = EXCLUDED.licence_number,
         valid_upto = EXCLUDED.valid_upto, updated_at = NOW(),
         last_alert_days = CASE WHEN vendor_licences.valid_upto IS DISTINCT FROM EXCLUDED.valid_upto THEN NULL ELSE vendor_licences.last_alert_days END`,
      [vendorId, l.licence_type, l.licence_number.trim(), l.valid_upto, adminId]);
  }
  // Keep the summary every seller check reads in step with the register (rules.licenceSummary)
  const s = licenceSummary(licences);
  await c.query(
    `UPDATE vendors SET drug_license_no = $2, drug_license_type = $3, drug_license_expiry = $4, drug_license_verified = TRUE, updated_at = NOW()
     WHERE id = $1`, [vendorId, s.drug_license_no, s.drug_license_type, s.drug_license_expiry]);
}

async function savePharmacistsTx(c: PoolClient, vendorId: string, adminId: string, pharmacists: PharmacistIn[]) {
  const regs = pharmacists.map((p) => p.registration_no.trim().toUpperCase());
  // Pharmacists no longer listed are kept, inactive: past H1 entries name them (C-08)
  await c.query(`UPDATE vendor_pharmacists SET is_active = FALSE, updated_at = NOW() WHERE vendor_id = $1 AND registration_no <> ALL($2)`, [vendorId, regs]);
  for (const [i, p] of pharmacists.entries()) {
    await c.query(
      `INSERT INTO vendor_pharmacists (vendor_id, full_name, registration_no, created_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (vendor_id, registration_no) DO UPDATE SET full_name = EXCLUDED.full_name, is_active = TRUE, updated_at = NOW()`,
      [vendorId, p.full_name.trim(), regs[i], adminId]);
  }
}

const auditSummary = (licences?: LicenceIn[], pharmacists?: PharmacistIn[]) => ({
  ...(licences ? { licences: licences.map((l) => ({ type: l.licence_type, number: l.licence_number.trim(), valid_upto: l.valid_upto })) } : {}),
  ...(pharmacists ? { pharmacists: pharmacists.map((p) => ({ name: p.full_name.trim(), registration_no: p.registration_no.trim().toUpperCase() })) } : {}),
});

/** POST /admin/partners — everything in one transaction, or nothing. */
export async function createPartner(adminId: string, d: CreatePartnerIn, ip?: string | null) {
  const today = todayIST();
  const gstin = checkedGstin(d.gstin, d.state);
  const prefix = d.invoice_prefix.trim().toUpperCase();
  fail([...licenceProblems(d.licences, today), ...pharmacistProblems(d.pharmacists), invoicePrefixProblem(prefix) ?? ''].filter(Boolean));
  if (!d.logins.length) throw new AppError('Add at least one partner login (mobile number)', 400);
  const mobiles = d.logins.map((l) => l.mobile.trim());
  if (new Set(mobiles).size !== mobiles.length) throw new AppError('The same login mobile is entered twice', 400);

  return withTransaction(async (c) => {
    await assertUnique(c, null, { invoice_prefix: prefix, gstin, licences: d.licences });
    const at = await location(c, d);
    const s = licenceSummary(d.licences);
    const vendor = (await c.query<{ id: string }>(
      `INSERT INTO vendors (name, trade_name, drug_license_no, drug_license_type, drug_license_expiry, drug_license_verified,
                            gst_number, gst_type, contact_name, contact_mobile, contact_email,
                            address_line1, address_line2, city, state, pincode, latitude, longitude,
                            vendor_type, approval_status, kyc_status, approved_by, approved_at, is_active, invoice_prefix, created_by)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6, 'regular', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               'marketplace_partner', 'approved', 'approved', $17, NOW(), TRUE, $18, $17)
       RETURNING id`,
      [d.legal_name.trim(), d.trade_name?.trim() || null, s.drug_license_no, s.drug_license_type, s.drug_license_expiry,
       gstin, d.contact_name.trim(), d.contact_mobile.trim(), d.contact_email?.trim() || null,
       d.address_line1.trim(), d.address_line2?.trim() || null, d.city.trim(), d.state.trim(), d.pincode.trim(),
       at.latitude, at.longitude, adminId, prefix])).rows[0];
    await saveLicencesTx(c, vendor.id, adminId, d.licences);
    await savePharmacistsTx(c, vendor.id, adminId, d.pharmacists);
    // C-46: one entry for the partner (no passwords anywhere), one per login (logins.ts)
    await writeAuditTx(c, { userId: null, action: 'partner_created', performedBy: adminId, ip: ip ?? null,
      newValue: { vendor_id: vendor.id, name: d.legal_name.trim(), gstin, invoice_prefix: prefix, state: d.state.trim(),
        pincode: d.pincode.trim(), ...auditSummary(d.licences, d.pharmacists), logins: d.logins.length } });
    const logins: LoginOut[] = [];
    for (const l of d.logins) logins.push(await addPartnerLoginTx(c, vendor.id, adminId, l, d.contact_name.trim()));
    return { vendor_id: vendor.id, logins };
  });
}

/** PUT /admin/partners/:id — details, licences (full list) and pharmacists (full list). */
export async function updatePartner(adminId: string, vendorId: string, d: UpdatePartnerIn, ip?: string | null) {
  const today = todayIST();
  return withTransaction(async (c) => {
    const before = (await c.query(
      `SELECT id, name, gst_number, state, invoice_prefix, vendor_type FROM vendors WHERE id = $1 FOR UPDATE`, [vendorId])).rows[0];
    if (!before || !['marketplace_partner', 'both'].includes(before.vendor_type)) throw new AppError('Partner not found', 404);
    const state = d.state ?? before.state;
    const gstinChanged = d.gstin !== undefined || d.state !== undefined;
    const gstin = gstinChanged ? checkedGstin(d.gstin ?? before.gst_number ?? '', state) : before.gst_number;
    const prefix = d.invoice_prefix?.trim().toUpperCase();
    fail([
      ...(d.licences ? licenceProblems(d.licences, today) : []),
      ...(d.pharmacists ? pharmacistProblems(d.pharmacists) : []),
      prefix ? invoicePrefixProblem(prefix) ?? '' : '',
    ].filter(Boolean));
    if (prefix && prefix !== before.invoice_prefix) {
      // Invoice numbers already issued in the old series must stay continuous (CGST Rule 46)
      const issued = (await c.query(`SELECT 1 FROM invoice_series WHERE series_key = $1 AND last_number > 0 LIMIT 1`, [`P:${vendorId}`])).rows[0];
      if (issued) throw new AppError('This partner has already issued invoices; its invoice prefix can no longer change', 409);
    }
    await assertUnique(c, vendorId, { invoice_prefix: prefix, gstin: gstinChanged ? gstin : undefined, licences: d.licences });

    const cols: Record<string, unknown> = {};
    if (d.legal_name !== undefined) cols.name = d.legal_name.trim();
    if (d.trade_name !== undefined) cols.trade_name = d.trade_name?.trim() || null;
    if (gstinChanged) cols.gst_number = gstin;
    for (const k of ['contact_name', 'contact_mobile', 'address_line1', 'city', 'state', 'pincode'] as const) {
      if (d[k] !== undefined) cols[k] = (d[k] as string).trim();
    }
    for (const k of ['contact_email', 'address_line2'] as const) if (d[k] !== undefined) cols[k] = d[k]?.trim() || null;
    if (d.pincode !== undefined || d.latitude !== undefined) {
      const at = await location(c, { pincode: d.pincode ?? (await c.query(`SELECT pincode FROM vendors WHERE id = $1`, [vendorId])).rows[0].pincode,
        latitude: d.latitude, longitude: d.longitude });
      cols.latitude = at.latitude; cols.longitude = at.longitude;
    }
    if (prefix) cols.invoice_prefix = prefix;
    const keys = Object.keys(cols);
    if (keys.length) {
      await c.query(`UPDATE vendors SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
        [vendorId, ...keys.map((k) => cols[k])]);
    }
    if (d.licences) await saveLicencesTx(c, vendorId, adminId, d.licences);
    if (d.pharmacists) await savePharmacistsTx(c, vendorId, adminId, d.pharmacists);
    await writeAuditTx(c, { userId: null, action: 'partner_updated', performedBy: adminId, ip: ip ?? null,
      oldValue: { vendor_id: vendorId, name: before.name, gstin: before.gst_number, invoice_prefix: before.invoice_prefix },
      newValue: { vendor_id: vendorId, fields: keys, ...auditSummary(d.licences, d.pharmacists) } });
    return { vendor_id: vendorId };
  });
}

/** POST /admin/partners/:id/logins — another login for an existing partner. */
export async function addPartnerLogin(adminId: string, vendorId: string, login: LoginIn) {
  return withTransaction(async (c) => {
    const v = (await c.query(`SELECT id, contact_name, name, vendor_type FROM vendors WHERE id = $1 FOR UPDATE`, [vendorId])).rows[0];
    if (!v || !['marketplace_partner', 'both'].includes(v.vendor_type)) throw new AppError('Partner not found', 404);
    return addPartnerLoginTx(c, vendorId, adminId, login, v.contact_name || v.name);
  });
}

const licenceStatus = `CASE WHEN vl.valid_upto < CURRENT_DATE THEN 'expired' WHEN vl.valid_upto <= CURRENT_DATE + 60 THEN 'expiring' ELSE 'valid' END`;

/** GET /admin/partners/:id — the partner as the admin edits it. */
export async function getPartner(vendorId: string) {
  const v = await queryOne<any>(
    `SELECT v.id, v.name AS legal_name, v.trade_name, v.gst_number AS gstin, v.contact_name, v.contact_mobile, v.contact_email,
            v.address_line1, v.address_line2, v.city, v.state, v.pincode, v.latitude, v.longitude, v.invoice_prefix,
            v.approval_status, v.is_active, v.vendor_type, v.drug_license_no, v.drug_license_type,
            to_char(v.drug_license_expiry, 'YYYY-MM-DD') AS drug_license_expiry, v.approved_at, v.created_at,
            EXISTS (SELECT 1 FROM invoice_series s WHERE s.series_key = 'P:' || v.id::text AND s.last_number > 0) AS has_invoices
     FROM vendors v WHERE v.id = $1 AND v.vendor_type IN ('marketplace_partner', 'both')`, [vendorId]);
  if (!v) throw new AppError('Partner not found', 404);
  const [licences, pharmacists, logins] = await Promise.all([
    query<any>(`SELECT vl.licence_type, vl.licence_number, to_char(vl.valid_upto, 'YYYY-MM-DD') AS valid_upto, ${licenceStatus} AS status
                FROM vendor_licences vl WHERE vl.vendor_id = $1
                ORDER BY array_position(ARRAY['dl20','dl21','dl20b','dl21b']::varchar[], vl.licence_type)`, [vendorId]),
    query<any>(`SELECT full_name, registration_no FROM vendor_pharmacists WHERE vendor_id = $1 AND is_active ORDER BY created_at, full_name`, [vendorId]),
    query<any>(`SELECT u.id AS user_id, u.mobile, up.full_name, u.must_change_password, u.is_active, u.last_login_at
                FROM vendor_users vu JOIN users u ON u.id = vu.user_id LEFT JOIN user_profiles up ON up.user_id = u.id
                WHERE vu.vendor_id = $1 ORDER BY vu.created_at`, [vendorId]),
  ]);
  return { ...v, licences, pharmacists, logins, selling_rights: sellingRights(licences, todayIST()) };
}

/** GET /admin/partners — every marketplace partner with its licences and logins at a glance. */
export async function listMarketplacePartners() {
  return query(
    `SELECT v.id, v.name, v.trade_name, v.pincode, v.city, v.state, v.invoice_prefix, v.vendor_rating, v.gst_number,
            v.approval_status, v.is_active, to_char(v.drug_license_expiry, 'YYYY-MM-DD') AS drug_license_expiry,
            COALESCE(r.commission_pct, 8) AS commission_pct, COALESCE(r.finding_fee_paise, 1500) AS finding_fee_paise,
            (SELECT COALESCE(json_agg(vl.licence_type ORDER BY vl.licence_type), '[]') FROM vendor_licences vl WHERE vl.vendor_id = v.id) AS licence_types,
            (SELECT COUNT(*)::int FROM vendor_pharmacists p WHERE p.vendor_id = v.id AND p.is_active) AS pharmacists,
            (SELECT json_agg(json_build_object('user_id', vu.user_id, 'mobile', u.mobile)) FROM vendor_users vu
               JOIN users u ON u.id = vu.user_id WHERE vu.vendor_id = v.id) AS logins
     FROM vendors v LEFT JOIN partner_commission_rates r ON r.partner_id = v.id
     WHERE v.vendor_type IN ('marketplace_partner', 'both')
     ORDER BY v.name`);
}
