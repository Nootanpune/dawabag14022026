// Sprint 31 — the managed lists of product categories and HSN codes: checks on a
// new entry and the matching key that finds a duplicate. Pure: unit-tested.
// The database applies the same key (product_categories.name_key) and the same
// HSN pattern (hsn_codes.code CHECK), so a duplicate can never slip in.
/** The GST slabs the catalogue accepts (same as the catalogue import). */
export const GST_RATES = [0, 5, 12, 18, 28] as const;
/** HSN codes are 4, 6 or 8 digits (e-invoices need 6+ for most sellers). */
export const HSN_RE = /^(\d{4}|\d{6}|\d{8})$/;

export const CATEGORY_MIN = 2;
export const CATEGORY_MAX = 60;
export const HSN_DESCRIPTION_MIN = 3;
export const HSN_DESCRIPTION_MAX = 200;

/** Trim and collapse inner spaces: what is stored. */
export function tidyName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/** One key per category whatever the capitals or spaces (same as the database's name_key). */
export function categoryKey(raw: string): string {
  return tidyName(raw).toLowerCase();
}

// Letters (any script, with their vowel signs), digits, spaces and the punctuation names use: & , . - ' ( ) / +
const CATEGORY_CHARS = /^[\p{L}\p{M}\p{N} &,.'()/+-]+$/u;

/** Plain problems with a new category name; empty = fine. */
export function categoryNameProblems(raw: string): string[] {
  const name = tidyName(raw ?? '');
  if (name.length < CATEGORY_MIN) return [`Write a category name of at least ${CATEGORY_MIN} letters`];
  const out: string[] = [];
  if (name.length > CATEGORY_MAX) out.push(`Keep the category name to ${CATEGORY_MAX} characters`);
  if (!/\p{L}/u.test(name)) out.push('A category name needs at least one letter');
  if (!CATEGORY_CHARS.test(name)) out.push('Use letters, numbers, spaces and & , . - \' ( ) / + only');
  return out;
}

/** An HSN code as typed ("3004 90 99", "3004.90.99") → digits only. */
export function tidyHsn(raw: string): string {
  return String(raw ?? '').replace(/[\s.]/g, '');
}

export interface NewHsn {
  code: string;
  description: string;
  gst_rate: number | null;
}

/** Plain problems with a new HSN entry; empty = fine. */
export function hsnProblems(h: { code: string; description?: string | null; gst_rate?: number | null }): string[] {
  const out: string[] = [];
  const code = tidyHsn(h.code);
  if (!HSN_RE.test(code)) out.push('The HSN code must be 4, 6 or 8 digits');
  const d = tidyName(h.description ?? '');
  if (d.length < HSN_DESCRIPTION_MIN) out.push('Add a short description (what goods the code covers)');
  else if (d.length > HSN_DESCRIPTION_MAX) out.push(`Keep the description to ${HSN_DESCRIPTION_MAX} characters`);
  if (h.gst_rate !== null && h.gst_rate !== undefined && !(GST_RATES as readonly number[]).includes(Number(h.gst_rate))) {
    out.push('GST rate must be 0, 5, 12, 18 or 28');
  }
  return out;
}

/** The existing entry a new category duplicates (case and spaces ignored), if any. */
export function findDuplicateCategory<T extends { name: string }>(list: T[], raw: string): T | undefined {
  const k = categoryKey(raw);
  return list.find((c) => categoryKey(c.name) === k);
}

/** A plain note when an HSN's usual GST rate differs from the product's (GST is never changed for you). */
export function hsnGstMismatch(hsn: { code: string; gst_rate: number | null } | null | undefined, productGst: number | string | null | undefined): string | null {
  if (!hsn || hsn.gst_rate === null || hsn.gst_rate === undefined) return null;
  if (productGst === null || productGst === undefined || productGst === '') return null;
  const g = Number(productGst);
  if (g === Number(hsn.gst_rate)) return null;
  return `HSN ${hsn.code} usually has GST ${hsn.gst_rate}%, but this product is set to ${g}%: check the GST rate (it has not been changed)`;
}

// ── Sprint 32: managing the lists (Admin → Catalogue lists) ──────────────────

/** Problems with renaming a category; `others` = the other entries of the list. Empty = fine. */
export function categoryRenameProblems(current: { name: string }, raw: string, others: { name: string }[]): string[] {
  const problems = categoryNameProblems(raw);
  if (problems.length) return problems;
  const clash = findDuplicateCategory(others, raw);
  if (clash) return [`"${clash.name}" is already in the list — choose a different name (two categories cannot be merged here)`];
  if (tidyName(raw) === current.name) return ['The new name is the same as the current one'];
  return [];
}

export interface HsnEdit { code?: string; description?: string | null; gst_rate?: number | null }

/**
 * Problems with editing an HSN entry. The code itself can be corrected only while no
 * product uses it (products and their invoices carry the code); a used code keeps its
 * number — its description and usual GST rate can still change. Empty = fine.
 */
export function hsnEditProblems(current: { code: string; description: string | null }, edit: HsnEdit, usedBy: number, codeTaken: boolean): string[] {
  const out: string[] = [];
  const newCode = edit.code === undefined ? current.code : tidyHsn(edit.code);
  if (newCode !== current.code) {
    if (usedBy > 0) out.push(`HSN ${current.code} is used by ${usedBy} product${usedBy === 1 ? '' : 's'}, so the code cannot be changed. Change its description or GST rate, or add the right code as a new entry`);
    else if (!HSN_RE.test(newCode)) out.push('The HSN code must be 4, 6 or 8 digits');
    else if (codeTaken) out.push(`HSN ${newCode} is already in the list`);
  }
  if (edit.description !== undefined) {
    const d = tidyName(edit.description ?? '');
    if (d.length < HSN_DESCRIPTION_MIN) out.push('Add a short description (what goods the code covers)');
    else if (d.length > HSN_DESCRIPTION_MAX) out.push(`Keep the description to ${HSN_DESCRIPTION_MAX} characters`);
  }
  if (edit.gst_rate !== undefined && edit.gst_rate !== null && !(GST_RATES as readonly number[]).includes(Number(edit.gst_rate))) {
    out.push('GST rate must be 0, 5, 12, 18 or 28');
  }
  return out;
}
