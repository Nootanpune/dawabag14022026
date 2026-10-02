// Medicine information for the product page (Sprint 33): the structure only.
// The words are written by Dawabag's pharmacist from the manufacturer's package
// insert / prescribing information — never copied from another pharmacy's
// website (copyright, and C-19: our pharmacist reviews every word shown to
// buyers). Pure (no database) so it can be unit-tested: content.test.ts.
import { z } from 'zod';
import { ClaimFlag, findRestrictedClaims } from '../../utils/claimsCheck';

/** Fixed safety-advice topics, in the order buyers see them. */
export const SAFETY_TOPICS = ['alcohol', 'pregnancy', 'breast_feeding', 'driving', 'kidney', 'liver'] as const;
export type SafetyTopic = typeof SAFETY_TOPICS[number];

export const SAFETY_LEVELS = ['safe', 'caution', 'unsafe', 'consult_doctor', 'not_known'] as const;
export type SafetyLevel = typeof SAFETY_LEVELS[number];

export const SAFETY_TOPIC_LABEL: Record<SafetyTopic, string> = {
  alcohol: 'Alcohol', pregnancy: 'Pregnancy', breast_feeding: 'Breast-feeding', driving: 'Driving', kidney: 'Kidney', liver: 'Liver',
};
export const SAFETY_LEVEL_LABEL: Record<SafetyLevel, string> = {
  safe: 'Safe', caution: 'Caution', unsafe: 'Unsafe', consult_doctor: 'Consult your doctor', not_known: 'Not known',
};

/** Shown under every medicine's information, approved or not. */
export const DISCLAIMER = 'For information only. Follow your doctor’s advice.';

// ── Input shape (what the staff editor sends) ────────────────────────────────
const text = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters`).default('');
const item = z.string().trim().max(300, 'Keep each point under 300 characters');
const list = (max = 20) => z.array(item).max(max, `At most ${max} points`).default([]);

const safetyEntry = z.object({
  level: z.enum(SAFETY_LEVELS).nullable().default(null),
  note: text(300),
}).strict();

export const infoContentSchema = z.object({
  overview: text(2000),
  uses: list(),
  how_to_use: text(2000),
  how_it_works: text(2000),
  side_effects: z.object({
    common: list(30),
    serious: list(30),
    contact_doctor_if: list(),
  }).strict().default({}),
  safety: z.object({
    alcohol: safetyEntry.default({}), pregnancy: safetyEntry.default({}), breast_feeding: safetyEntry.default({}),
    driving: safetyEntry.default({}), kidney: safetyEntry.default({}), liver: safetyEntry.default({}),
  }).strict().default({}),
  missed_dose: text(1000),
  interactions: z.object({
    medicines: list(30),
    food: list(),
    conditions: list(),
  }).strict().default({}),
  quick_tips: list(),
  facts: z.object({
    therapeutic_class: text(120),
    chemical_class: text(120),
    action_class: text(120),
    habit_forming: z.boolean().nullable().default(null),
  }).strict().default({}),
  faqs: z.array(z.object({ question: text(300), answer: text(1500) }).strict()).max(20, 'At most 20 questions').default([]),
  references: z.array(z.object({
    source: text(200),                                         // e.g. "Manufacturer's package insert"
    date: z.string().trim().max(40).default(''),               // e.g. "March 2026" — as printed on the source
  }).strict()).max(10, 'At most 10 references').default([]),
}).strict();

export type InfoContent = z.output<typeof infoContentSchema>;

/** Parses editor input, filling every missing section with its empty value and dropping empty list points. */
export function parseInfoContent(input: unknown): InfoContent {
  const c = infoContentSchema.parse(input ?? {});
  const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  return {
    ...c,
    uses: clean(c.uses),
    quick_tips: clean(c.quick_tips),
    side_effects: { common: clean(c.side_effects.common), serious: clean(c.side_effects.serious),
      contact_doctor_if: clean(c.side_effects.contact_doctor_if) },
    interactions: { medicines: clean(c.interactions.medicines), food: clean(c.interactions.food),
      conditions: clean(c.interactions.conditions) },
    faqs: c.faqs.filter((f) => f.question && f.answer),
    references: c.references.filter((r) => r.source),
  };
}

/** Every buyer-facing sentence, for the claims check (C-17 / C-19) and "is anything written?". */
export function allText(c: InfoContent): string[] {
  return [
    c.overview, ...c.uses, c.how_to_use, c.how_it_works,
    ...c.side_effects.common, ...c.side_effects.serious, ...c.side_effects.contact_doctor_if,
    ...SAFETY_TOPICS.map((t) => c.safety[t]?.note ?? ''),
    c.missed_dose, ...c.interactions.medicines, ...c.interactions.food, ...c.interactions.conditions,
    ...c.quick_tips, c.facts.therapeutic_class, c.facts.chemical_class, c.facts.action_class,
    ...c.faqs.flatMap((f) => [f.question, f.answer]),
  ].filter((s) => !!s && !!s.trim());
}

/** Possible forbidden cure / prevention claims (Drugs and Magic Remedies Act, C-19); a flag needs the reviewer's reason. */
export function infoFlags(c: InfoContent): ClaimFlag[] {
  return findRestrictedClaims(...allText(c));
}

/** What still stops a draft going to review. */
export function submitProblems(c: InfoContent): string[] {
  const problems: string[] = [];
  if (!allText(c).length && !SAFETY_TOPICS.some((t) => c.safety[t]?.level)) problems.push('Write at least one section');
  if (!c.references.length) problems.push('Add the source you used (e.g. the manufacturer’s package insert and its date)');
  return problems;
}

// ── Buyer view: only sections with something in them ──────────────────────────
export interface PublicSafety { topic: SafetyTopic; label: string; level: SafetyLevel; level_label: string; note: string | null }

/**
 * The approved content as buyers get it: empty sections are left out entirely
 * (the page hides them), safety advice only for topics the pharmacist set.
 */
export function publicSections(c: InfoContent) {
  const out: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => {
    if (v == null) return;
    if (typeof v === 'string' && !v.trim()) return;
    if (Array.isArray(v) && !v.length) return;
    if (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v as object).length) return;
    out[k] = v;
  };
  const nonEmpty = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => (Array.isArray(v) ? v.length : v != null && v !== '')));
  put('overview', c.overview);
  put('uses', c.uses);
  put('how_to_use', c.how_to_use);
  put('how_it_works', c.how_it_works);
  put('side_effects', nonEmpty(c.side_effects));
  const safety: PublicSafety[] = SAFETY_TOPICS
    .filter((t) => c.safety[t]?.level)
    .map((t) => ({ topic: t, label: SAFETY_TOPIC_LABEL[t], level: c.safety[t].level as SafetyLevel,
      level_label: SAFETY_LEVEL_LABEL[c.safety[t].level as SafetyLevel], note: c.safety[t].note || null }));
  put('safety', safety);
  put('missed_dose', c.missed_dose);
  put('interactions', nonEmpty(c.interactions));
  put('quick_tips', c.quick_tips);
  put('facts', nonEmpty({ therapeutic_class: c.facts.therapeutic_class, chemical_class: c.facts.chemical_class,
    action_class: c.facts.action_class, habit_forming: c.facts.habit_forming }));
  put('faqs', c.faqs);
  put('references', c.references.map((r) => ({ source: r.source, date: r.date || null })));
  return out;
}

/** "Manufacturer's package insert, March 2026" */
export const referenceLine = (r: { source: string; date?: string | null }) => (r.date ? `${r.source}, ${r.date}` : r.source);
