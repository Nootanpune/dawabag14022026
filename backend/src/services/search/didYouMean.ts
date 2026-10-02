// "Did you mean …" for a search that found nothing (Sprint 25). The search itself
// already forgives small typos (pg_trgm word similarity ≥ 0.5, see productSearch
// .service.ts); this looks further, with a lower bar, for names close to what was
// typed so the buyer can try one with a tap. Only names of products a buyer can
// see are offered: active, not deleted, never Schedule X / NDPS (C-10).
// Called by the web and app only after a search returned no results.
import { query } from '../../config/database';
import { canSearchFuzzy, parseSearchText } from './searchText';
import { isMissingTrigramError, markTrigramUnavailable, trigramAvailable } from './trigramSupport';

/** Whole-word trigram similarity. Below the search's own 0.5 (these are offered,
 *  not silently matched) but high enough that a short word like "dolo" is not
 *  "corrected" to an unrelated medicine (domperidone scores 0.13) — look-alike
 *  names are a dispensing risk, so the page also asks the buyer to check the name
 *  against their prescription. */
export const SUGGEST_MIN_SIMILARITY = 0.35;
export const MAX_SUGGESTIONS = 3;

/** Case-insensitive de-duplication, keeping the first spelling seen. */
export function uniqueTerms(terms: string[], max = MAX_SUGGESTIONS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of terms) {
    const k = t.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(t.trim());
    if (out.length >= max) break;
  }
  return out;
}

export async function didYouMean(raw: unknown): Promise<string[]> {
  const st = parseSearchText(raw);
  if (!st || !canSearchFuzzy(st) || !(await trigramAvailable())) return [];
  try {
    // Terms: generic names and the brand word (first word of the name), so a
    // suggestion is a name, not a pack description; generic first when equally close
    const rows = await query<{ term: string }>(
      `WITH terms AS (
         SELECT DISTINCT btrim(t.term) AS term
         FROM products p
         CROSS JOIN LATERAL (VALUES (p.generic_name), (split_part(btrim(p.name), ' ', 1))) AS t(term)
         WHERE p.is_active = TRUE AND p.deleted_at IS NULL
           AND COALESCE(p.drug_schedule, '') NOT IN ('Schedule X', 'NDPS')
           AND t.term IS NOT NULL AND length(btrim(t.term)) >= 3
       )
       SELECT term FROM (
         SELECT term, similarity($1, lower(term)) AS s FROM terms
       ) x
       WHERE s >= $2
       ORDER BY s DESC, term
       LIMIT 12`,
      [st.text, SUGGEST_MIN_SIMILARITY],
    );
    return uniqueTerms(rows.map((r) => r.term));
  } catch (err) {
    if (!isMissingTrigramError(err)) throw err;
    markTrigramUnavailable();
    return [];
  }
}
