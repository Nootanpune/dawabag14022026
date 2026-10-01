import type { LegalInfo } from '@/lib/legal/api';

/** One line for phones: who operates the pharmacy and its drug licence numbers (C-04). */
export default function FooterLicenceSummary({ info }: { info: LegalInfo }) {
  const dl = info.drug_licences;
  const numbers = [dl?.retail_20, dl?.retail_21].filter((n) => n && n.trim()).join(', ');
  return (
    <p className="text-sm text-gray-600">
      <span className="font-medium text-gray-800">{info.entity?.name || 'Dawabag'}</span>
      {numbers && <> · Drug licence {numbers}</>}
      {info.pharmacist_in_charge?.name && <> · Pharmacist {info.pharmacist_in_charge.name}</>}
    </p>
  );
}
