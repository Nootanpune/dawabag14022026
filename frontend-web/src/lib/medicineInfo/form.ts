// The staff editor's form (Sprint 33): list sections are edited as "one point per
// line" text and turned back into lists on save. Pure, no storage.
import { SAFETY_LEVEL_LABEL, SAFETY_TOPICS, SAFETY_TOPIC_LABEL, withDefaults, type InfoContent, type PublicSections, type SafetyLevel } from './types';

export interface EditorForm {
  overview: string;
  uses: string;
  how_to_use: string;
  how_it_works: string;
  se_common: string;
  se_serious: string;
  se_contact: string;
  safety: InfoContent['safety'];
  missed_dose: string;
  ix_medicines: string;
  ix_food: string;
  ix_conditions: string;
  quick_tips: string;
  facts: InfoContent['facts'];
  faqs: { question: string; answer: string }[];
  references: { source: string; date: string }[];
}

const lines = (xs: string[]) => xs.join('\n');
const list = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export function toForm(c: Partial<InfoContent> | null | undefined): EditorForm {
  const x = withDefaults(c);
  return {
    overview: x.overview, uses: lines(x.uses), how_to_use: x.how_to_use, how_it_works: x.how_it_works,
    se_common: lines(x.side_effects.common), se_serious: lines(x.side_effects.serious), se_contact: lines(x.side_effects.contact_doctor_if),
    safety: x.safety, missed_dose: x.missed_dose,
    ix_medicines: lines(x.interactions.medicines), ix_food: lines(x.interactions.food), ix_conditions: lines(x.interactions.conditions),
    quick_tips: lines(x.quick_tips), facts: x.facts, faqs: x.faqs, references: x.references,
  };
}

export function fromForm(f: EditorForm): InfoContent {
  return {
    overview: f.overview.trim(), uses: list(f.uses), how_to_use: f.how_to_use.trim(), how_it_works: f.how_it_works.trim(),
    side_effects: { common: list(f.se_common), serious: list(f.se_serious), contact_doctor_if: list(f.se_contact) },
    safety: Object.fromEntries(SAFETY_TOPICS.map((t) => [t, { level: f.safety[t].level, note: f.safety[t].note.trim() }])) as InfoContent['safety'],
    missed_dose: f.missed_dose.trim(),
    interactions: { medicines: list(f.ix_medicines), food: list(f.ix_food), conditions: list(f.ix_conditions) },
    quick_tips: list(f.quick_tips),
    facts: { ...f.facts, therapeutic_class: f.facts.therapeutic_class.trim(), chemical_class: f.facts.chemical_class.trim(), action_class: f.facts.action_class.trim() },
    faqs: f.faqs.map((q) => ({ question: q.question.trim(), answer: q.answer.trim() })).filter((q) => q.question && q.answer),
    references: f.references.map((r) => ({ source: r.source.trim(), date: r.date.trim() })).filter((r) => r.source),
  };
}

/**
 * What buyers would see for this content — the same pruning the server does —
 * so the pharmacist reviews exactly the page buyers will get.
 */
export function previewSections(c: InfoContent): PublicSections {
  const out: PublicSections = {};
  const nonEmpty = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => (Array.isArray(v) ? v.length : v != null && v !== ''))) as Partial<T>;
  if (c.overview) out.overview = c.overview;
  if (c.uses.length) out.uses = c.uses;
  if (c.how_to_use) out.how_to_use = c.how_to_use;
  if (c.how_it_works) out.how_it_works = c.how_it_works;
  const se = nonEmpty(c.side_effects);
  if (Object.keys(se).length) out.side_effects = se;
  const safety = SAFETY_TOPICS.filter((t) => c.safety[t]?.level).map((t) => ({
    topic: t, label: SAFETY_TOPIC_LABEL[t], level: c.safety[t].level as SafetyLevel,
    level_label: SAFETY_LEVEL_LABEL[c.safety[t].level as SafetyLevel], note: c.safety[t].note || null }));
  if (safety.length) out.safety = safety;
  if (c.missed_dose) out.missed_dose = c.missed_dose;
  const ix = nonEmpty(c.interactions);
  if (Object.keys(ix).length) out.interactions = ix;
  if (c.quick_tips.length) out.quick_tips = c.quick_tips;
  const facts = nonEmpty(c.facts);
  if (Object.keys(facts).length) out.facts = facts;
  if (c.faqs.length) out.faqs = c.faqs;
  if (c.references.length) out.references = c.references.map((r) => ({ source: r.source, date: r.date || null }));
  return out;
}
