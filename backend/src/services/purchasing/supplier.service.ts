// Suppliers / companies Dawabag buys from (Sprint 7; licences Sprint 30). A supplier is a
// vendor of type 'supplier' (or 'both' for a partner that also supplies). Every drug
// licence it holds — wholesale 20B / 21B, manufacturing 25 / 28 (and loan 25A / 28A,
// repacking 25B) or any other form — goes into the shared register (party_licences) as
// checked by the admin entering it (C-02, C-07). Purchases still need the separate
// approval (POST /vendors/:id/approve) and are blocked while any licence has lapsed.
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { todayIST } from '../../utils/ist';
import { eligibility, LicenceIn, licenceLine, licenceProblems, licenceSummary } from '../licences/forms';
import { assertNumbersFree, licenceBadge, licencesByParty, listLicences, saveCheckedLicencesTx } from '../licences/register.service';

export interface SupplierIn {
  name: string;
  gst_number: string;
  state: string;
  city?: string | null;
  contact_name?: string | null;
  contact_mobile?: string | null;
  contact_email?: string | null;
  licences: LicenceIn[];
}

const supplierProblems = (licences: LicenceIn[]) =>
  licenceProblems(licences, { party: 'supplier', today: todayIST(), requireValidUpto: true });

export async function createSupplier(adminId: string, d: SupplierIn) {
  const problems = supplierProblems(d.licences);
  if (problems.length) throw new AppError(problems.join('. '), 400);
  return withTransaction(async (c) => {
    await assertNumbersFree(c, { newParty: 'vendor', gstin: d.gst_number }, d.licences);
    const s = licenceSummary(d.licences.map((l) => ({ ...l, valid_upto: l.valid_upto ?? null })))!;
    const row = (await c.query(
      `INSERT INTO vendors (name, drug_license_no, drug_license_type, drug_license_expiry, drug_license_verified, gst_number, state, city,
                            contact_name, contact_mobile, contact_email, vendor_type, approval_status, created_by)
       VALUES ($1, $2, $3, $4, TRUE, $5, $6, $7, $8, $9, $10, 'supplier', 'pending', $11) RETURNING id, name, approval_status`,
      [d.name, s.number, s.form, s.expiry, d.gst_number, d.state, d.city ?? null, d.contact_name ?? null, d.contact_mobile ?? null,
       d.contact_email ?? null, adminId])).rows[0];
    const saved = await saveCheckedLicencesTx(c, { vendorId: row.id }, d.licences, adminId);
    await writeAuditTx(c, { userId: null, action: 'supplier_added', performedBy: adminId,
      newValue: { vendor_id: row.id, name: d.name, licences: saved.saved } });
    return row;
  });
}

export async function updateSupplier(adminId: string, vendorId: string, d: Partial<SupplierIn>) {
  if (d.licences) {
    const problems = supplierProblems(d.licences);
    if (problems.length) throw new AppError(problems.join('. '), 400);
  }
  return withTransaction(async (c) => {
    const before = (await c.query(`SELECT id, name, vendor_type FROM vendors WHERE id = $1 FOR UPDATE`, [vendorId])).rows[0];
    if (!before || !['supplier', 'both'].includes(before.vendor_type)) throw new AppError('Supplier not found', 404);
    const cols: Record<string, unknown> = {};
    for (const k of ['name', 'gst_number', 'state', 'city', 'contact_name', 'contact_mobile', 'contact_email'] as const) {
      if (d[k] !== undefined) cols[k] = d[k] ?? null;
    }
    const keys = Object.keys(cols);
    if (keys.length) {
      await c.query(`UPDATE vendors SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
        [vendorId, ...keys.map((k) => cols[k])]);
    }
    let licences;
    if (d.licences) {
      await assertNumbersFree(c, { vendorId }, d.licences);
      licences = await saveCheckedLicencesTx(c, { vendorId }, d.licences, adminId);
    }
    await writeAuditTx(c, { userId: null, action: 'supplier_updated', performedBy: adminId,
      newValue: { vendor_id: vendorId, fields: keys, ...(licences ? { licences: licences.saved, removed: licences.removed } : {}) } });
    return { vendor_id: vendorId };
  });
}

/** Suppliers with every licence, count, earliest valid-till and a ≤ 30-day / expired warning. */
export async function listSuppliers() {
  const rows = await query<any>(
    `SELECT id, name, drug_license_no, to_char(drug_license_expiry, 'YYYY-MM-DD') AS drug_license_expiry, gst_number, state, city,
            approval_status, is_active, vendor_type,
            (drug_license_expiry IS NOT NULL AND drug_license_expiry >= CURRENT_DATE AND approval_status = 'approved' AND is_active) AS can_supply
     FROM vendors WHERE vendor_type IN ('supplier', 'both') ORDER BY name`);
  const byVendor = await licencesByParty('vendor', rows.map((r) => r.id));
  const out = [];
  for (const r of rows) {
    const licences = byVendor.get(r.id) ?? await listLicences({ vendorId: r.id });   // older suppliers: their one licence
    out.push({ ...r, licences, licence_line: licenceLine(licences.filter((l) => l.status === 'verified')), ...licenceBadge(licences) });
  }
  return out;
}

export async function getSupplier(vendorId: string) {
  const v = await queryOne<any>(
    `SELECT id, name, gst_number, state, city, contact_name, contact_mobile, contact_email, approval_status, is_active, vendor_type,
            drug_license_no, to_char(drug_license_expiry, 'YYYY-MM-DD') AS drug_license_expiry,
            (drug_license_expiry IS NOT NULL AND drug_license_expiry >= CURRENT_DATE AND approval_status = 'approved' AND is_active) AS can_supply
     FROM vendors WHERE id = $1 AND vendor_type IN ('supplier', 'both')`, [vendorId]);
  if (!v) throw new AppError('Supplier not found', 404);
  const all = await listLicences({ vendorId }, { history: true });
  const current = all.filter((l) => ['verified', 'pending'].includes(l.status));
  const check = eligibility(current, 'supplier', todayIST());
  return { ...v, licences: current, licence_history: all.filter((l) => !['verified', 'pending'].includes(l.status)),
    licence_line: licenceLine(current.filter((l) => l.status === 'verified')), ...licenceBadge(current),
    licence_problems: check.reasons, licence_warnings: check.warnings };
}
