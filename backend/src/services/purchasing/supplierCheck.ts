// A supplier may sell to Dawabag only while approved, active and holding drug licences
// that are all in date (Drugs Rules: buy only from licensed sellers; C-02). Sprint 30:
// every licence of the supplier counts — the summary on vendors carries the EARLIEST
// valid-till of its checked licences (refresh_licence_summary), so any lapsed licence
// blocks purchase orders and goods receipts until the renewal is entered, and the
// message names it. A supplier with no wholesale (20B/21B) or manufacturing (25/28)
// licence is a WARNING only: the rulebook comments say "licensed supplier" without
// naming forms, so the store is told but not stopped.
import { PoolClient } from 'pg';
import { AppError } from '../../utils/AppError';
import { todayIST } from '../../utils/ist';
import { eligibility, formLabel, licenceLine } from '../licences/forms';
import { listLicences } from '../licences/register.service';

export async function assertSupplierCanSupply(client: PoolClient, vendorId: string) {
  const v = (await client.query(
    `SELECT id, name, vendor_type, approval_status, is_active, drug_license_no, to_char(drug_license_expiry, 'YYYY-MM-DD') AS drug_license_expiry,
            gst_number, state
     FROM vendors WHERE id = $1`, [vendorId])).rows[0];
  if (!v) throw new AppError('Supplier not found', 404);
  if (!['supplier', 'both'].includes(v.vendor_type)) throw new AppError(`${v.name} is not set up as a supplier`, 400);
  if (v.approval_status !== 'approved' || !v.is_active) throw new AppError(`${v.name} is not an approved, active supplier`, 409);
  const today = todayIST();
  const licences = (await listLicences({ vendorId }, { client })).filter((l) => l.status === 'verified');
  if (!v.drug_license_expiry || v.drug_license_expiry < today) {
    const lapsed = licences.filter((l) => l.valid_upto && l.valid_upto < today)
      .map((l) => `${formLabel(l.form, l.form_name)} ${l.licence_number} (expired ${l.valid_upto})`);
    throw new AppError(lapsed.length
      ? `${v.name}'s drug licence ${lapsed.join(', ')} has expired; purchases are blocked until the renewed licence is entered (C-02)`
      : `${v.name}'s drug licence has expired or is not on file; purchases are blocked`, 409);
  }
  const check = eligibility(licences, 'supplier', today);
  const warnings = [...check.warnings, ...(check.missingKind && !check.expired.length ? check.reasons : [])];
  return {
    ...v,
    licence_line: licenceLine(licences) ?? v.drug_license_no,
    licence_warnings: warnings,
  } as { id: string; name: string; drug_license_no: string; gst_number: string | null; state: string | null;
    licence_line: string; licence_warnings: string[] };
}
