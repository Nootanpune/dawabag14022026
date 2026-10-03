// The Schedule H1 register for inspection (C-09): Dawabag's admin sees every seller's
// register; a partner sees only its own (the partner is the licensee). Built from the
// database on each request — nothing is written to disk.
import { query } from '../../config/database';

export interface H1Filter { from: string; to: string; partnerId?: string; registerKey?: string }

export const H1_EXPORT_COLUMNS = [
  'register_key', 'entry_no', 'dispensed_at', 'seller_type', 'partner_name', 'seller_licence_no', 'order_number',
  'product_name', 'batch_number', 'quantity', 'patient_name', 'patient_address', 'prescriber_name', 'prescriber_address',
  'prescriber_reg_no', 'pharmacist_name', 'pharmacist_reg_no', 'chain_legacy', 'row_hash',
] as const;

export async function listH1Entries(f: H1Filter) {
  const params: unknown[] = [f.from, f.to];
  let where = `h.dispensed_at::date BETWEEN $1 AND $2`;
  if (f.partnerId) { params.push(f.partnerId); where += ` AND h.partner_id = $${params.length}`; }
  if (f.registerKey) { params.push(f.registerKey); where += ` AND h.register_key = $${params.length}`; }
  return query<any>(
    `SELECT h.id, h.register_key, h.entry_no::int AS entry_no, h.dispensed_at, h.seller_type, v.name AS partner_name,
            h.seller_licence_no, o.order_number, h.product_name, h.batch_number, h.quantity, h.patient_name, h.patient_address,
            h.prescriber_name, h.prescriber_address, h.prescriber_reg_no, h.pharmacist_name, h.pharmacist_reg_no,
            h.chain_legacy, h.row_hash
     FROM h1_register h JOIN orders o ON o.id = h.order_id LEFT JOIN vendors v ON v.id = h.partner_id
     WHERE ${where}
     ORDER BY h.chain_legacy DESC, h.register_key NULLS FIRST, h.entry_no NULLS FIRST, h.dispensed_at`, params);
}

/** The registers there are (one per seller licence), with their last entry number. */
export async function listH1Registers(partnerId?: string) {
  return query<any>(
    `SELECT h.register_key, h.seller_type, h.partner_id, v.name AS partner_name, MAX(h.seller_licence_no) AS seller_licence_no,
            COUNT(*)::int AS entries, MAX(h.entry_no)::int AS last_entry_no, MAX(h.dispensed_at) AS last_dispensed_at
     FROM h1_register h LEFT JOIN vendors v ON v.id = h.partner_id
     WHERE h.register_key IS NOT NULL ${partnerId ? 'AND h.partner_id = $1' : ''}
     GROUP BY h.register_key, h.seller_type, h.partner_id, v.name ORDER BY h.seller_type, v.name NULLS FIRST, h.register_key`,
    partnerId ? [partnerId] : []);
}
