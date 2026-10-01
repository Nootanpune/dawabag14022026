// A supplier may sell to Dawabag only while approved, active and holding an
// unexpired drug licence (Drugs Rules: buy only from licensed sellers; C-02).
import { PoolClient } from 'pg';
import { AppError } from '../../utils/AppError';

export async function assertSupplierCanSupply(client: PoolClient, vendorId: string) {
  const v = (await client.query(
    `SELECT id, name, vendor_type, approval_status, is_active, drug_license_no, drug_license_expiry, gst_number, state
     FROM vendors WHERE id = $1`, [vendorId])).rows[0];
  if (!v) throw new AppError('Supplier not found', 404);
  if (!['supplier', 'both'].includes(v.vendor_type)) throw new AppError(`${v.name} is not set up as a supplier`, 400);
  if (v.approval_status !== 'approved' || !v.is_active) throw new AppError(`${v.name} is not an approved, active supplier`, 409);
  if (!v.drug_license_expiry || new Date(v.drug_license_expiry) < new Date(new Date().toDateString())) {
    throw new AppError(`${v.name}'s drug licence has expired or is not on file; purchases are blocked`, 409);
  }
  return v as { id: string; name: string; drug_license_no: string; gst_number: string | null; state: string | null };
}
