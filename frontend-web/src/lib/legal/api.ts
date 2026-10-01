// Public legal details for the footer and /legal (C-04 licences on the website,
// C-36 grievance officer). Read from the server on every visit; editable by a
// super admin in Settings (PUT /admin/settings/legal.*).
import api from '../api';

export interface LegalInfo {
  entity: { name: string; address: string; gstin: string; cin: string } | null;
  drug_licences: {
    retail_20: string;
    retail_21: string;
    wholesale_20b: string;
    wholesale_21b: string;
    valid_upto: string;
  } | null;
  pharmacist_in_charge: { name: string; registration_no: string } | null;
  grievance_officer: { name: string; email: string; phone: string; address: string } | null;
  grievance_policy: { acknowledge_within_hours: number; resolve_within_days: number };
  /** true on the owner's trial server (demo data, placeholder licences) */
  trial?: boolean;
}

export const legalKeys = { info: ['legal', 'info'] as const };

export async function fetchLegalInfo(): Promise<LegalInfo> {
  const { data } = await api.get('/legal/info');
  return data.data;
}
