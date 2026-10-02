// Form definitions for the legal.* settings (C-03, C-04, C-36). The server
// validates each object strictly (PUT /admin/settings/:key); these only
// describe which text fields to show.

export interface LegalField {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'date' | 'textarea';
  maxLength?: number;
}

export interface LegalSettingDef {
  key: string;
  title: string;
  fields: LegalField[];
}

export const LEGAL_SETTINGS: LegalSettingDef[] = [
  {
    key: 'legal.entity',
    title: 'Company (seller of record)',
    fields: [
      { name: 'name', label: 'Legal name', maxLength: 200 },
      { name: 'address', label: 'Registered address', type: 'textarea', maxLength: 500 },
      { name: 'gstin', label: 'GSTIN', maxLength: 15 },
      { name: 'cin', label: 'CIN', maxLength: 21 },
    ],
  },
  {
    key: 'legal.pharmacist_in_charge',
    title: 'Pharmacist in charge (C-03)',
    fields: [
      { name: 'name', label: 'Name', maxLength: 200 },
      { name: 'registration_no', label: 'Pharmacy council registration no.', maxLength: 60 },
    ],
  },
  {
    key: 'legal.grievance_officer',
    title: 'Grievance officer (C-36)',
    fields: [
      { name: 'name', label: 'Name', maxLength: 200 },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone', maxLength: 20 },
      { name: 'address', label: 'Address', type: 'textarea', maxLength: 500 },
    ],
  },
];

export const isLegalKey = (key: string) => key.startsWith('legal.');

/** Current server value → editable strings (missing fields become ''). */
export function toLegalDraft(def: LegalSettingDef, value: unknown): Record<string, string> {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return Object.fromEntries(def.fields.map((f) => [f.name, v[f.name] == null ? '' : String(v[f.name])]));
}

/** Trimmed object to PUT; the server rejects unknown keys (strict schema). */
export function fromLegalDraft(def: LegalSettingDef, draft: Record<string, string>): Record<string, string> {
  return Object.fromEntries(def.fields.map((f) => [f.name, (draft[f.name] ?? '').trim()]));
}
