// Dosage form shown on the product placeholder tile. Display only: inferred from
// the product name because the catalogue has no dosage-form column. Never used
// for any dispensing or schedule decision (the server owns those).

export type DosageForm = 'Tablet' | 'Capsule' | 'Syrup' | 'Injection' | 'Cream' | 'Drops' | 'Other';

const RULES: [DosageForm, RegExp][] = [
  ['Tablet', /\b(tab|tabs|tablet|tablets)\b/i],
  ['Capsule', /\b(cap|caps|capsule|capsules)\b/i],
  ['Syrup', /\b(syp|syr|syrup|suspension|susp|liquid|oral solution)\b/i],
  ['Injection', /\b(inj|injection|vial|ampoule|amp)\b/i],
  ['Cream', /\b(cream|ointment|oint|gel|lotion)\b/i],
  ['Drops', /\b(drop|drops|eye drop|ear drop)\b/i],
];

export function inferDosageForm(name: string | null | undefined): DosageForm {
  const n = name ?? '';
  for (const [form, re] of RULES) if (re.test(n)) return form;
  return 'Other';
}

/** First letter or digit of the product name, for the placeholder tile. */
export function productInitial(name: string | null | undefined): string {
  const m = (name ?? '').match(/[A-Za-z0-9]/);
  return m ? m[0].toUpperCase() : '?';
}
