// Licence register (Rulebook C-07): every licence the business holds, its
// validity and who renews it. days_left / validity are computed by the server.
import api from '../api';

export const LICENCE_TYPES = [
  { value: 'retail_20', label: 'Retail drug licence (Form 20)' },
  { value: 'retail_21', label: 'Retail drug licence (Form 21)' },
  { value: 'wholesale_20b', label: 'Wholesale drug licence (Form 20B)' },
  { value: 'wholesale_21b', label: 'Wholesale drug licence (Form 21B)' },
  { value: 'gst', label: 'GST registration' },
  { value: 'shop_establishment', label: 'Shop & establishment' },
  { value: 'fssai', label: 'FSSAI' },
  { value: 'trade', label: 'Trade licence' },
  { value: 'other', label: 'Other' },
] as const;

export type LicenceType = (typeof LICENCE_TYPES)[number]['value'];

export interface Licence {
  id: string;
  licence_type: LicenceType;
  licence_number: string;
  issued_by: string | null;
  premises: string | null;
  valid_from: string | null;
  valid_upto: string | null;
  renewal_owner: string;
  renewal_owner_email: string | null;
  notes: string | null;
  is_active: boolean;
  days_left: number | null;
  validity: 'valid' | 'expiring' | 'expired' | 'no_expiry';
}

export interface LicenceInput {
  licence_type: LicenceType;
  licence_number: string;
  issued_by?: string | null;
  premises?: string | null;
  valid_from?: string | null;
  valid_upto?: string | null;
  renewal_owner: string;
  renewal_owner_email?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export const licenceKeys = { list: ['licences'] as const };

export function licenceTypeLabel(t: string): string {
  return LICENCE_TYPES.find((x) => x.value === t)?.label ?? t;
}

export async function fetchLicences(): Promise<Licence[]> {
  const { data } = await api.get('/compliance/licences');
  return data.data?.licences ?? [];
}

export async function saveLicence(body: LicenceInput, id?: string): Promise<Licence> {
  const { data } = id ? await api.put(`/compliance/licences/${id}`, body) : await api.post('/compliance/licences', body);
  return data.data;
}
