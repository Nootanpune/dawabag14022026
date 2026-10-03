// Product class and the new-drug flag (Sprint 40; handover D6, URS-040/041; owner backlog
// §5.1 #11; Rulebook C-10 online eligibility, C-17 product declarations).
//   drug      — medicines under the Drugs and Cosmetics Act (the default)
//   device    — medical devices (Medical Devices Rules 2017): OUT of the launch scope;
//               never 'permitted' for online sale until Dawabag has a device track
//               (database CHECK products_device_not_permitted)
//   cosmetic  — cosmetics (D&C Act, Cosmetics Rules 2020)
//   ayush     — Ayurveda / Siddha / Unani / Homoeopathy medicines (separate licensing)
//   general   — anything else sold in the shop (nutrition, hygiene, household)
// New drug (New Drugs and Clinical Trials Rules 2019: approved in India within the last
// four years, or a new indication / dosage form / route): may be 'permitted' only with
// an explicit confirmation note by the Dawabag pharmacist who allows it, kept on the
// product and in the status log (database CHECK products_new_drug_confirmed).
// No database imports: unit-tested in rules.test.ts.

export const PRODUCT_CLASSES = ['drug', 'device', 'cosmetic', 'ayush', 'general'] as const;
export type ProductClass = (typeof PRODUCT_CLASSES)[number];

export const PRODUCT_CLASS_LABELS: Record<ProductClass, string> = {
  drug: 'Drug (medicine)', device: 'Medical device', cosmetic: 'Cosmetic', ayush: 'AYUSH medicine', general: 'General product',
};

export const NEW_DRUG_CONFIRMATION_MIN = 20;

/** Reads a class from a catalogue file cell ('Medical device' → device); undefined = blank, 'invalid' = unreadable. */
export function parseProductClass(v: unknown): ProductClass | undefined | 'invalid' {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s || s === '—') return undefined;
  if (/^(drug|medicine|allopathic|allopathy)$/.test(s)) return 'drug';
  if (/^(device|medical device|md)$/.test(s)) return 'device';
  if (/^(cosmetic|cosmetics)$/.test(s)) return 'cosmetic';
  if (/^(ayush|ayurveda|ayurvedic|homoeopathy|homeopathy|homoeopathic|homeopathic|unani|siddha)$/.test(s)) return 'ayush';
  if (/^(general|fmcg|other|general product)$/.test(s)) return 'general';
  return 'invalid';
}

/** Why a product cannot be allowed online because of its class / new-drug flag (null = fine). */
export function classOnlineProblem(p: { name: string; product_class?: string | null; is_new_drug?: boolean | null },
  status: string, newDrugConfirmation?: string | null): string | null {
  if (status !== 'permitted') return null;
  if (p.product_class === 'device') return `${p.name} is a medical device: devices are not sold online until Dawabag has a device track`;
  if (p.is_new_drug && String(newDrugConfirmation ?? '').trim().length < NEW_DRUG_CONFIRMATION_MIN) {
    return `${p.name} is a new drug (NDCT Rules 2019): confirm why it may be sold online (at least ${NEW_DRUG_CONFIRMATION_MIN} characters, e.g. the CDSCO approval and that a prescription is required)`;
  }
  return null;
}
