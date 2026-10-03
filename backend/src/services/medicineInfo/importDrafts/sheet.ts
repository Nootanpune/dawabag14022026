// Sprint 45 — the "drafts" sheet of a medicine-information drafts workbook, as rows of
// text → checked draft rows. Pure (no database, no file): unit-tested in sheet.test.ts.
//
// The words were written OUTSIDE Dawabag (owner request 2026-10-03). They are only ever
// imported as a DRAFT that a registered pharmacist checks against the pack insert and a
// second registered pharmacist approves (C-19, Sprint 36 four eyes); content_json is held
// to exactly the editor's schema (content.ts), so nothing the editor could not hold gets in.
import { ZodError } from 'zod';
import { itemKey } from '../../partnerStockImport/normalise';
import { InfoContent, SAFETY_TOPICS, allText, parseInfoContent } from '../content';

export const DRAFT_SHEET = 'drafts';
/** The heading row, exactly (any order; nothing else). */
export const DRAFT_COLUMNS = [
  'item_name', 'pack', 'company', 'assumed_composition', 'composition_confidence', 'drafting_note', 'content_json',
] as const;
export type DraftColumn = typeof DRAFT_COLUMNS[number];
export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type Confidence = typeof CONFIDENCE_LEVELS[number];

export const MAX_DRAFT_ROWS = 5000;
const MAX = { item_name: 500, pack: 100, company: 255, assumed_composition: 500, drafting_note: 1000, content_json: 32_000 };

export interface DraftRow {
  /** Row number in the sheet (the heading is row 1) */
  rowNumber: number;
  item_name: string;
  pack: string | null;
  company: string | null;
  assumed_composition: string;
  composition_confidence: Confidence | null;
  drafting_note: string | null;
  /** The partner's item identity — the same key the partner's stock import remembers links by */
  item_key: string | null;
  content: InfoContent | null;
  /** Why the row cannot be imported (empty = valid) */
  problems: string[];
}

export interface DraftSheet { rows: DraftRow[] }

/** Checks the heading row; throws a plain message naming what is missing or extra. */
export function columnIndex(header: string[]): Record<DraftColumn, number> {
  const names = header.map((h) => String(h ?? '').trim().toLowerCase());
  while (names.length && !names[names.length - 1]) names.pop();
  const missing = DRAFT_COLUMNS.filter((c) => !names.includes(c));
  const extra = names.filter((n) => !(DRAFT_COLUMNS as readonly string[]).includes(n));
  const twice = DRAFT_COLUMNS.filter((c) => names.indexOf(c) !== names.lastIndexOf(c));
  if (missing.length || extra.length || twice.length) {
    const parts = [
      missing.length ? `missing ${missing.join(', ')}` : '',
      extra.length ? `not expected ${extra.map((e) => (e ? `"${e}"` : '(a column without a heading)')).join(', ')}` : '',
      twice.length ? `more than once ${twice.join(', ')}` : '',
    ].filter(Boolean);
    throw new DraftSheetError(`The first row of the "${DRAFT_SHEET}" sheet must have exactly these columns: ${DRAFT_COLUMNS.join(', ')} (${parts.join('; ')})`);
  }
  return Object.fromEntries(DRAFT_COLUMNS.map((c) => [c, names.indexOf(c)])) as Record<DraftColumn, number>;
}

export class DraftSheetError extends Error {}

const zodMessage = (e: ZodError) => e.issues.slice(0, 5)
  .map((i) => `${i.path.length ? i.path.join('.') : 'content_json'}: ${i.code === 'unrecognized_keys' ? `unknown field(s) ${(i as { keys?: string[] }).keys?.join(', ')}` : i.message}`)
  .join('; ');

/** content_json → the editor's content, or the reason it cannot be used. */
export function parseContentJson(text: string): { content: InfoContent | null; problem: string | null } {
  const raw = text.trim();
  if (!raw) return { content: null, problem: 'content_json is empty' };
  if (raw.length > MAX.content_json) return { content: null, problem: `content_json is longer than ${MAX.content_json} characters` };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return { content: null, problem: 'content_json is not valid JSON' }; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { content: null, problem: 'content_json must be a JSON object { … }' };
  try {
    const content = parseInfoContent(value);
    if (!allText(content).length && !SAFETY_TOPICS.some((t) => content.safety[t]?.level)) {
      return { content: null, problem: 'content_json has no text in any section' };
    }
    return { content, problem: null };
  } catch (e) {
    if (e instanceof ZodError) return { content: null, problem: `content_json does not match the medicine information format — ${zodMessage(e)}` };
    throw e;
  }
}

const cellOf = (cells: string[], i: number) => String(cells[i] ?? '').trim();
const orNull = (s: string) => (s ? s : null);

/**
 * rows[0] is the heading row (sheet row 1); blank rows are left out. Every row is
 * returned, valid or not, so the result can list each one with its reason.
 */
export function parseDraftRows(rows: string[][]): DraftSheet {
  if (!rows.length) throw new DraftSheetError(`The "${DRAFT_SHEET}" sheet is empty`);
  const col = columnIndex(rows[0] ?? []);
  const out: DraftRow[] = [];
  const seen = new Map<string, number>();
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i] ?? [];
    if (cells.every((c) => !String(c ?? '').trim())) continue;
    if (out.length >= MAX_DRAFT_ROWS) throw new DraftSheetError(`The sheet has more than ${MAX_DRAFT_ROWS} rows; split it into smaller files`);
    const v = (c: DraftColumn) => cellOf(cells, col[c]);
    const problems: string[] = [];
    const item_name = v('item_name');
    if (!item_name) problems.push('item_name is empty');
    for (const c of ['item_name', 'pack', 'company', 'assumed_composition', 'drafting_note'] as const) {
      if (v(c).length > MAX[c]) problems.push(`${c} is longer than ${MAX[c]} characters`);
    }
    const assumed = v('assumed_composition');
    if (!assumed) problems.push('assumed_composition is empty');
    const conf = v('composition_confidence').toLowerCase();
    const confidence = (CONFIDENCE_LEVELS as readonly string[]).includes(conf) ? conf as Confidence : null;
    if (!confidence) problems.push('composition_confidence must be high, medium or low');
    const parsed = parseContentJson(v('content_json'));
    if (parsed.problem) problems.push(parsed.problem);
    const pack = orNull(v('pack'));
    const company = orNull(v('company'));
    const key = item_name ? itemKey({ item_name, pack, manufacturer: company }) : null;
    if (key) {
      const first = seen.get(key);
      if (first) problems.push(`the same item (name, pack and company) is already on row ${first}`);
      else seen.set(key, i + 1);
    }
    out.push({
      rowNumber: i + 1, item_name, pack, company, assumed_composition: assumed, composition_confidence: confidence,
      drafting_note: orNull(v('drafting_note')), item_key: key, content: parsed.content, problems,
    });
  }
  if (!out.length) throw new DraftSheetError(`The "${DRAFT_SHEET}" sheet has no rows under the heading`);
  return { rows: out };
}
