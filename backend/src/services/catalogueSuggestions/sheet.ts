// Sprint 46 — the "suggestions" sheet of a catalogue suggestions workbook, as rows of
// text → checked suggestion rows. Pure (no database, no file): unit-tested in sheet.test.ts.
//
// The suggested details were prepared OUTSIDE Dawabag (owner request 2026-10-04). They
// are only ever SHOWN to the pharmacist completing a draft product; nothing here is a
// decision. Values are held to exactly what the "New products to complete" form accepts
// (schedules, dosage forms, product classes, GST slabs, HSN pattern), so a suggestion the
// form could not take is reported as invalid rather than stored (C-10, C-19, C-25).
import { itemKey } from '../partnerStockImport/normalise';
import { DOSAGE_FORMS, GST_RATES, HSN_RE, SCHEDULES } from '../catalogueDrafts/rules';
import { categoryNameProblems, tidyHsn, tidyName } from '../catalogueLists/rules';
import { PRODUCT_CLASSES, parseProductClass, type ProductClass } from '../productClass/rules';

export const SUGGESTION_SHEET = 'suggestions';
/** The heading row, exactly (any order; nothing else). */
export const SUGGESTION_COLUMNS = [
  'item_name', 'pack', 'company', 'generic_name', 'strength', 'dosage_form', 'drug_schedule', 'cold_chain',
  'product_class', 'is_new_drug', 'category', 'hsn_code', 'gst_rate', 'confidence', 'note',
] as const;
export type SuggestionColumn = typeof SUGGESTION_COLUMNS[number];
export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type Confidence = typeof CONFIDENCE_LEVELS[number];

export const MAX_SUGGESTION_ROWS = 5000;
const MAX = { item_name: 500, pack: 100, company: 255, generic_name: 500, strength: 100, category: 100, note: 1000 };

/** The values a suggestion may carry — the same keys as the draft's decided fields. Blank cells are left out. */
export interface SuggestedValues {
  generic_name?: string;
  strength?: string;
  dosage_form?: typeof DOSAGE_FORMS[number];
  drug_schedule?: typeof SCHEDULES[number];
  cold_chain?: boolean;
  product_class?: ProductClass;
  is_new_drug?: boolean;
  category?: string;
  hsn_code?: string;
  gst_rate?: number;
}
export const SUGGESTED_KEYS = ['generic_name', 'strength', 'dosage_form', 'drug_schedule', 'cold_chain', 'product_class', 'is_new_drug',
  'category', 'hsn_code', 'gst_rate'] as const satisfies readonly (keyof SuggestedValues)[];

export interface SuggestionRow {
  /** Row number in the sheet (the heading is row 1) */
  rowNumber: number;
  item_name: string;
  pack: string | null;
  company: string | null;
  /** The partner's item identity — the same key the partner's stock import remembers links by */
  item_key: string | null;
  suggested: SuggestedValues;
  confidence: Confidence | null;
  note: string | null;
  /** Why the row cannot be imported (empty = valid) */
  problems: string[];
}

export class SuggestionSheetError extends Error {}

/** Checks the heading row; throws a plain message naming what is missing or extra. */
export function columnIndex(header: string[]): Record<SuggestionColumn, number> {
  const names = header.map((h) => String(h ?? '').trim().toLowerCase());
  while (names.length && !names[names.length - 1]) names.pop();
  const missing = SUGGESTION_COLUMNS.filter((c) => !names.includes(c));
  const extra = names.filter((n) => !(SUGGESTION_COLUMNS as readonly string[]).includes(n));
  const twice = SUGGESTION_COLUMNS.filter((c) => names.indexOf(c) !== names.lastIndexOf(c));
  if (missing.length || extra.length || twice.length) {
    const parts = [
      missing.length ? `missing ${missing.join(', ')}` : '',
      extra.length ? `not expected ${extra.map((e) => (e ? `"${e}"` : '(a column without a heading)')).join(', ')}` : '',
      twice.length ? `more than once ${twice.join(', ')}` : '',
    ].filter(Boolean);
    throw new SuggestionSheetError(`The first row of the "${SUGGESTION_SHEET}" sheet must have exactly these columns: ${SUGGESTION_COLUMNS.join(', ')} (${parts.join('; ')})`);
  }
  return Object.fromEntries(SUGGESTION_COLUMNS.map((c) => [c, names.indexOf(c)])) as Record<SuggestionColumn, number>;
}

/**
 * A schedule cell → the system's value. The exact values are accepted in any case, and
 * the short forms "H", "H1", "G", "X" (with or without "Schedule"), "Non scheduled".
 * undefined = blank; 'invalid' with a reason otherwise.
 */
export function parseSchedule(raw: string): { value?: typeof SCHEDULES[number]; problem?: string } {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return {};
  const exact = SCHEDULES.find((x) => x.toLowerCase() === s.toLowerCase());
  if (exact) return { value: exact };
  const short = s.toLowerCase().replace(/^sch(edule|\.)?\s*/, '');
  const map: Record<string, typeof SCHEDULES[number]> = {
    g: 'Schedule G', h: 'Schedule H', h1: 'Schedule H1', x: 'Schedule X', otc: 'OTC', ndps: 'NDPS',
    'non-scheduled': 'Non-scheduled', 'non scheduled': 'Non-scheduled', nonscheduled: 'Non-scheduled',
  };
  if (map[short]) return { value: map[short] };
  if (/^c\s*(\/\s*c1|1)?$/.test(short)) {
    return { problem: 'drug_schedule: Schedule C / C1 is a separate yes/no on the form, not a drug schedule — put the schedule (e.g. Schedule H) here and mention C / C1 in the note' };
  }
  return { problem: `drug_schedule "${s}" is not one of: ${SCHEDULES.join(', ')}` };
}

/** yes / no cells (also y / n, true / false, 1 / 0). */
export function parseYesNo(raw: string): boolean | undefined | 'invalid' {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  if (['yes', 'y', 'true', '1'].includes(s)) return true;
  if (['no', 'n', 'false', '0'].includes(s)) return false;
  return 'invalid';
}

/** A dosage form cell → the form's spelling (any case; a plural "Tablets" is read as Tablet). */
export function parseDosageForm(raw: string): typeof DOSAGE_FORMS[number] | undefined | 'invalid' {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  return DOSAGE_FORMS.find((f) => f.toLowerCase() === s || `${f.toLowerCase()}s` === s) ?? 'invalid';
}

/** A GST cell ("12", "12%", "12.0") → one of the accepted slabs. */
export function parseGst(raw: string): number | undefined | 'invalid' {
  const s = raw.trim().replace(/%$/, '').trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && (GST_RATES as readonly number[]).includes(n) ? n : 'invalid';
}

const cellOf = (cells: string[], i: number) => String(cells[i] ?? '').trim();
const orNull = (s: string) => (s ? s : null);

/**
 * rows[0] is the heading row (sheet row 1); blank rows are left out. Every row is
 * returned, valid or not, so the result can list each one with its reason.
 */
export function parseSuggestionRows(rows: string[][]): SuggestionRow[] {
  if (!rows.length) throw new SuggestionSheetError(`The "${SUGGESTION_SHEET}" sheet is empty`);
  const col = columnIndex(rows[0] ?? []);
  const out: SuggestionRow[] = [];
  const seen = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    if (cells.every((c) => !String(c ?? '').trim())) continue;
    if (out.length >= MAX_SUGGESTION_ROWS) throw new SuggestionSheetError(`The sheet has more than ${MAX_SUGGESTION_ROWS} rows; split it into smaller files`);
    const v = (c: SuggestionColumn) => cellOf(cells, col[c]);
    const problems: string[] = [];
    const s: SuggestedValues = {};
    const item_name = v('item_name');
    if (!item_name) problems.push('item_name is empty');
    for (const c of ['item_name', 'pack', 'company', 'generic_name', 'strength', 'category', 'note'] as const) {
      if (v(c).length > MAX[c]) problems.push(`${c} is longer than ${MAX[c]} characters`);
    }
    if (v('generic_name')) s.generic_name = tidyName(v('generic_name'));
    if (v('strength')) s.strength = tidyName(v('strength'));

    const form = parseDosageForm(v('dosage_form'));
    if (form === 'invalid') problems.push(`dosage_form "${v('dosage_form')}" is not one of: ${DOSAGE_FORMS.join(', ')}`);
    else if (form) s.dosage_form = form;

    const schedule = parseSchedule(v('drug_schedule'));
    if (schedule.problem) problems.push(schedule.problem);
    else if (schedule.value) s.drug_schedule = schedule.value;

    const cold = parseYesNo(v('cold_chain'));
    if (cold === 'invalid') problems.push('cold_chain must be yes or no');
    else if (cold !== undefined) s.cold_chain = cold;

    const cls = parseProductClass(v('product_class'));
    if (cls === 'invalid') problems.push(`product_class "${v('product_class')}" is not one of: ${PRODUCT_CLASSES.join(', ')}`);
    else if (cls) s.product_class = cls;

    const newDrug = parseYesNo(v('is_new_drug'));
    if (newDrug === 'invalid') problems.push('is_new_drug must be yes or no');
    else if (newDrug !== undefined) s.is_new_drug = newDrug;

    if (v('category')) {
      const name = tidyName(v('category'));
      const p = categoryNameProblems(name);
      if (p.length) problems.push(`category: ${p.join('; ')}`);
      else s.category = name;
    }

    if (v('hsn_code')) {
      const code = tidyHsn(v('hsn_code'));
      if (!HSN_RE.test(code)) problems.push(`hsn_code "${v('hsn_code')}" must be 4, 6 or 8 digits`);
      else s.hsn_code = code;
    }

    const gst = parseGst(v('gst_rate'));
    if (gst === 'invalid') problems.push(`gst_rate "${v('gst_rate')}" must be one of ${GST_RATES.join(', ')}`);
    else if (gst !== undefined) s.gst_rate = gst;

    const conf = v('confidence').toLowerCase();
    const confidence = (CONFIDENCE_LEVELS as readonly string[]).includes(conf) ? conf as Confidence : null;
    if (!confidence) problems.push('confidence must be high, medium or low');

    if (!Object.keys(s).length && !problems.some((p) => !/^(item_name|confidence)/.test(p))) problems.push('no suggested values in this row');

    const pack = orNull(v('pack'));
    const company = orNull(v('company'));
    const key = item_name ? itemKey({ item_name, pack, manufacturer: company }) : null;
    if (key) {
      const first = seen.get(key);
      if (first) problems.push(`the same item (name, pack and company) is already on row ${first}`);
      else seen.set(key, i + 1);
    }
    out.push({ rowNumber: i + 1, item_name, pack, company, item_key: key, suggested: s, confidence, note: orNull(v('note')), problems });
  }
  if (!out.length) throw new SuggestionSheetError(`The "${SUGGESTION_SHEET}" sheet has no rows under the heading`);
  return out;
}
