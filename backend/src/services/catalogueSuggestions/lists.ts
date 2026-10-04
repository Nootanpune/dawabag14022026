// Sprint 46 — a suggestion's category and HSN code against Dawabag's managed lists
// (Sprint 31): the list's spelling when listed, otherwise kept and flagged for the
// pharmacist ("new category — create with Alt+C if right"). Pure: unit-tested.
import { categoryKey, hsnGstMismatch } from '../catalogueLists/rules';
import type { SuggestedValues } from './sheet';

export interface SuggestionFlag { field: 'category' | 'hsn_code' | 'gst_rate'; message: string }

export interface ListEntry { name: string; active: boolean; gst_rate?: number | null }
export interface Lists { categories: Map<string, ListEntry>; hsn: Map<string, ListEntry> }

/**
 * The list's spelling of a suggested category / HSN code when it is listed; otherwise the
 * value is kept and flagged for the pharmacist (Sprint 31 lists: "create it with Alt+C").
 */
export function checkAgainstLists(s: SuggestedValues, lists: Lists): { suggested: SuggestedValues; flags: SuggestionFlag[] } {
  const out = { ...s };
  const flags: SuggestionFlag[] = [];
  if (s.category) {
    const hit = lists.categories.get(categoryKey(s.category));
    if (!hit) flags.push({ field: 'category', message: `New category "${s.category}" — not in the list yet: create it with Alt+C if right` });
    else if (!hit.active) flags.push({ field: 'category', message: `The category "${hit.name}" is no longer used: choose another` });
    else out.category = hit.name;
  }
  if (s.hsn_code) {
    const hit = lists.hsn.get(s.hsn_code);
    if (!hit) flags.push({ field: 'hsn_code', message: `New HSN code ${s.hsn_code} — not in the HSN list yet: create it with Alt+C if right` });
    else if (!hit.active) flags.push({ field: 'hsn_code', message: `HSN ${hit.name} is no longer used: choose another` });
    else {
      out.hsn_code = hit.name;
      const mismatch = hsnGstMismatch({ code: hit.name, gst_rate: hit.gst_rate ?? null }, s.gst_rate);
      if (mismatch) flags.push({ field: 'gst_rate', message: mismatch.replace('this product is set to', 'the suggestion says').replace(' (it has not been changed)', '') });
    }
  }
  return { suggested: out, flags };
}

