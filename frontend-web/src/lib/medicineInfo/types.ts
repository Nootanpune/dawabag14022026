// Medicine information (Sprint 33): the structure the pharmacist fills from the
// manufacturer's package insert. Buyers get only the approved version, with empty
// sections left out by the server (C-19). Mirrors backend services/medicineInfo/content.ts.

export const SAFETY_TOPICS = ['alcohol', 'pregnancy', 'breast_feeding', 'driving', 'kidney', 'liver'] as const;
export type SafetyTopic = (typeof SAFETY_TOPICS)[number];
export const SAFETY_LEVELS = ['safe', 'caution', 'unsafe', 'consult_doctor', 'not_known'] as const;
export type SafetyLevel = (typeof SAFETY_LEVELS)[number];

export const SAFETY_TOPIC_LABEL: Record<SafetyTopic, string> = {
  alcohol: 'Alcohol', pregnancy: 'Pregnancy', breast_feeding: 'Breast-feeding', driving: 'Driving', kidney: 'Kidney', liver: 'Liver',
};
export const SAFETY_LEVEL_LABEL: Record<SafetyLevel, string> = {
  safe: 'Safe', caution: 'Caution', unsafe: 'Unsafe', consult_doctor: 'Consult your doctor', not_known: 'Not known',
};

export interface InfoContent {
  overview: string;
  uses: string[];
  how_to_use: string;
  how_it_works: string;
  side_effects: { common: string[]; serious: string[]; contact_doctor_if: string[] };
  safety: Record<SafetyTopic, { level: SafetyLevel | null; note: string }>;
  missed_dose: string;
  interactions: { medicines: string[]; food: string[]; conditions: string[] };
  quick_tips: string[];
  facts: { therapeutic_class: string; chemical_class: string; action_class: string; habit_forming: boolean | null };
  faqs: { question: string; answer: string }[];
  references: { source: string; date: string }[];
}

export function emptyContent(): InfoContent {
  return {
    overview: '', uses: [], how_to_use: '', how_it_works: '',
    side_effects: { common: [], serious: [], contact_doctor_if: [] },
    safety: Object.fromEntries(SAFETY_TOPICS.map((t) => [t, { level: null, note: '' }])) as InfoContent['safety'],
    missed_dose: '', interactions: { medicines: [], food: [], conditions: [] }, quick_tips: [],
    facts: { therapeutic_class: '', chemical_class: '', action_class: '', habit_forming: null },
    faqs: [], references: [],
  };
}

/** Fills anything missing (older or partial content from the server). */
export function withDefaults(c: Partial<InfoContent> | null | undefined): InfoContent {
  const e = emptyContent();
  if (!c) return e;
  return {
    ...e, ...c,
    side_effects: { ...e.side_effects, ...(c.side_effects ?? {}) },
    safety: Object.fromEntries(SAFETY_TOPICS.map((t) => [t, { ...e.safety[t], ...(c.safety?.[t] ?? {}) }])) as InfoContent['safety'],
    interactions: { ...e.interactions, ...(c.interactions ?? {}) },
    facts: { ...e.facts, ...(c.facts ?? {}) },
    faqs: c.faqs ?? [], references: (c.references ?? []).map((r) => ({ source: r.source ?? '', date: r.date ?? '' })),
  };
}

// ── Buyer view ────────────────────────────────────────────────────────────────
export interface PublicSafety { topic: SafetyTopic; label: string; level: SafetyLevel; level_label: string; note: string | null }

export interface PublicSections {
  overview?: string;
  uses?: string[];
  how_to_use?: string;
  how_it_works?: string;
  side_effects?: Partial<InfoContent['side_effects']>;
  safety?: PublicSafety[];
  missed_dose?: string;
  interactions?: Partial<InfoContent['interactions']>;
  quick_tips?: string[];
  facts?: Partial<InfoContent['facts']>;
  faqs?: { question: string; answer: string }[];
  references?: { source: string; date: string | null }[];
}

export interface PublicInfo {
  available: boolean;
  version?: number;
  sections?: PublicSections;
  reviewed?: { name: string; reg_no: string; reviewed_at: string };
  disclaimer: string;
}

/** Section order and buyer-facing names; also the sticky tabs on desktop. */
export const SECTION_ORDER: { key: keyof PublicSections; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'uses', label: 'Uses' },
  { key: 'how_to_use', label: 'How to use' },
  { key: 'how_it_works', label: 'How it works' },
  { key: 'side_effects', label: 'Side effects' },
  { key: 'safety', label: 'Safety advice' },
  { key: 'missed_dose', label: 'Missed dose' },
  { key: 'interactions', label: 'Interactions' },
  { key: 'quick_tips', label: 'Quick tips' },
  { key: 'facts', label: 'Fact box' },
  { key: 'faqs', label: 'FAQs' },
  { key: 'references', label: 'References' },
];

/** The sections the server sent, in page order. */
export function presentSections(s: PublicSections | undefined) {
  return SECTION_ORDER.filter(({ key }) => s && s[key] !== undefined);
}

// ── Staff editor ──────────────────────────────────────────────────────────────
export type VersionStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'superseded';
export interface ClaimFlag { condition: string; claim: string; excerpt: string }

export interface InfoVersion {
  id: string;
  product_id: string;
  version: number;
  status: VersionStatus;
  content?: InfoContent;
  flags: ClaimFlag[];
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  reviewer_name: string | null;
  reviewer_reg_no: string | null;
  updated_by_name: string | null;
  submitted_by_name: string | null;
}

export interface InfoEditorData {
  product: { id: string; name: string; generic_name: string | null; sku: string; drug_schedule: string | null; catalogue_state: string; is_active: boolean };
  live: InfoVersion | null;
  open: InfoVersion | null;
  last_rejected: InfoVersion | null;
  start_from: InfoContent;
  problems: string[];
  history: InfoVersion[];
}

export interface InfoQueueItem extends InfoVersion {
  product_name: string;
  sku: string;
  drug_schedule: string | null;
  catalogue_state: string;
}

export const STATUS_LABEL: Record<VersionStatus, string> = {
  draft: 'Draft', pending_review: 'Waiting for pharmacist review', approved: 'Live', rejected: 'Rejected', superseded: 'Replaced',
};
