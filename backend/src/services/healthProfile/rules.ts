// Health profile (Sprint 33) — pure rules, unit-tested in rules.test.ts.
// Health data is sensitive personal data: it is kept only after the buyer ticks
// an explicit consent naming the purpose (DPDP Act s.6, C-41), only for that
// purpose, and the buyer can delete it at any time (C-43, C-44).
import { z } from 'zod';

/** Version of the consent text below; stored with every consent record. */
export const HEALTH_CONSENT_VERSION = 'health-profile-v1';

/** What the buyer agrees to — shown next to the tick box on the website and in the app. */
export const HEALTH_CONSENT_PURPOSE =
  'I agree that Dawabag may keep the allergies, health conditions and medicines I enter here, for me and the family members I add, '
  + 'so that its pharmacists can see them when they check our prescriptions and orders. It is not shared with anyone else. '
  + 'I can change or delete it at any time.';

const MAX_ITEMS = 30;
const MAX_LEN = 100;

const listSchema = z.array(z.string().max(MAX_LEN, `Keep each entry under ${MAX_LEN} characters`))
  .max(MAX_ITEMS, `At most ${MAX_ITEMS} entries`).default([]);

/** Trimmed, blanks dropped, the same entry only once (whatever the capitals). */
export function cleanList(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of xs) {
    const x = raw.replace(/\s+/g, ' ').trim();
    const k = x.toLowerCase();
    if (!x || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

export const profileSchema = z.object({
  consent: z.boolean().optional(),
  allergies: listSchema,
  conditions: listSchema,
  current_medicines: listSchema,
}).strict();

export const memberSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter the name').max(120),
  relationship: z.string().trim().min(2, 'Say how they are related (e.g. mother)').max(40),
  age_years: z.number().int().min(0, 'Age must be 0 to 120').max(120, 'Age must be 0 to 120').nullable().optional(),
  allergies: listSchema,
  conditions: listSchema,
}).strict();

/** Age today from the age entered on a date ("42 on 2026-10-02" is 43 a year later). */
export function ageNow(ageYears: number | null | undefined, recordedOn: string | null | undefined, today: string): number | null {
  if (ageYears == null) return null;
  if (!recordedOn) return ageYears;
  const [y1, m1, d1] = recordedOn.split('-').map(Number);
  const [y2, m2, d2] = today.split('-').map(Number);
  let years = y2 - y1;
  if (m2 < m1 || (m2 === m1 && d2 < d1)) years -= 1;
  return Math.min(120, ageYears + Math.max(0, years));
}

/** May health data be saved right now? Either already consented, or ticking the box in this request. */
export function consentProblem(hasConsent: boolean, ticked: boolean | undefined): string | null {
  if (hasConsent || ticked === true) return null;
  return 'Tick the consent box to save your health profile';
}
