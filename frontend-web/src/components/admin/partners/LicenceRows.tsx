'use client';
import type { LicenceDraft } from '@/lib/licences/forms';
import LicenceRowsEditor from '@/components/licences/LicenceRowsEditor';
import FormSection from './FormSection';

interface Props {
  licences: LicenceDraft[];
  today: string;
  onChange: (rows: LicenceDraft[]) => void;
}

/**
 * Every drug licence the partner holds — retail Form 20 / 21, wholesale 20B / 21B and any
 * other form (Schedule X 20F / 20G, homoeopathic, manufacturing, or a named other form),
 * each with its own number and valid-till date (C-02, C-07, C-33).
 */
export default function LicenceRows({ licences, today, onChange }: Props) {
  return (
    <FormSection title="Drug licences"
      hint="Add every licence the partner holds. Retail (20 / 21) lets it sell to patients; wholesale (20B / 21B) to licensed trade buyers. An expired licence cannot be accepted, and any licence that lapses later stops its selling until renewed.">
      <LicenceRowsEditor rows={licences} onChange={onChange} today={today} suggested={['dl20', 'dl21', 'dl20b', 'dl21b']}
        showDetails idPrefix="partner-licence" />
    </FormSection>
  );
}
