// SQL pieces for the forgiving product search (Sprint 23). Pure: it only builds
// text and parameters, so the ranking rules are unit-tested without a database.
//
// Matching — a product matches when EVERY required word (see searchText.ts) is
//   • a substring of the brand name or the generic (salt) name, or
//   • in the fuzzy pass only: close enough to a word in either by trigram word
//     similarity (`word <% column`, threshold pg_trgm.word_similarity_threshold,
//     set per connection in config/database.ts), which forgives typos;
// or when the old full-text match on name + generic + marketer still hits, so
// nothing the earlier search found is lost. The caller runs the cheap substring
// pass first and the fuzzy pass only when that finds nothing.
//
// Ranking — 1) the name equals / starts with the whole query, 2) the sum over all
// words of how well each fits (substring = 1, generic substring = 0.9, in the
// fuzzy pass else its similarity), so "dolo 650" puts Dolo 650 above Dolo 500,
// 3) in stock first (applied by the caller, which knows the stock), 4) name.
//
// The trigram GIN indexes on lower(name) and lower(generic_name) (migration 21)
// serve both the LIKE '%word%' and the `<%` conditions.
import { SearchText, isFuzzyWord } from './searchText';

export interface SearchSql {
  /** A single boolean condition to AND into the WHERE clause. */
  where: string;
  /** 0 = name is the query, 1 = name starts with it, 2 = other match. */
  tier: string;
  /** Higher is better. */
  score: string;
}

/** Adds a parameter and returns its placeholder. The WHERE and the ranking take
 *  separate callbacks: the count query must carry only the WHERE's parameters. */
export type AddParam = (value: string) => string;

const NAME = 'lower(p.name)';
const GENERIC = 'lower(p.generic_name)';
/** Generic-name hits rank just below the same hit on the brand name. */
export const GENERIC_WEIGHT = 0.9;

export function buildProductSearchSql(
  st: SearchText,
  opts: { fuzzy: boolean; whereParam: AddParam; rankParam: AddParam },
): SearchSql {
  const fuzzy = (w: string) => opts.fuzzy && isFuzzyWord(w);
  const wp = opts.whereParam;
  const matches = st.required.map((w) => {
    const pat = wp(`%${w}%`);
    const parts = [`${NAME} LIKE ${pat}`, `${GENERIC} LIKE ${pat}`];
    if (fuzzy(w)) { const pw = wp(w); parts.push(`${pw} <% ${NAME}`, `${pw} <% ${GENERIC}`); }
    return `(${parts.join(' OR ')})`;
  });
  const where = `((${matches.join(' AND ')}) OR p.search_vector @@ plainto_tsquery('english', ${wp(st.text)}))`;

  // Each word scores 1 for a brand-name substring, 0.9 for a generic one, else its
  // best similarity; CASE stops at the first hit so most rows skip word_similarity
  const rp = opts.rankParam;
  const wordScores = st.words.map((w) => {
    const pat = rp(`%${w}%`);
    if (!fuzzy(w)) {
      return `CASE WHEN ${NAME} LIKE ${pat} THEN 1 WHEN ${GENERIC} LIKE ${pat} THEN ${GENERIC_WEIGHT} ELSE 0 END`;
    }
    const pw = rp(w);
    return `CASE WHEN ${NAME} LIKE ${pat} THEN 1`
      + ` WHEN ${GENERIC} LIKE ${pat} THEN GREATEST(${GENERIC_WEIGHT}, word_similarity(${pw}, ${NAME}))`
      + ` ELSE GREATEST(word_similarity(${pw}, ${NAME}), ${GENERIC_WEIGHT} * COALESCE(word_similarity(${pw}, ${GENERIC}), 0)) END`;
  });
  const score = wordScores.join(' + ');

  // Punctuation in the name is folded like the query's ("Dolo-650" = "dolo 650");
  // the cheap first-letters test keeps the regexp to names that can qualify
  const foldedName = `btrim(regexp_replace(${NAME}, '[^[:alnum:]]+', ' ', 'g'))`;
  const lead = rp(`${st.words[0].slice(0, 3)}%`);
  const tier = `CASE WHEN ${NAME} NOT LIKE ${lead} THEN 2`
    + ` WHEN ${foldedName} = ${rp(st.text)} THEN 0 WHEN ${foldedName} LIKE ${rp(`${st.text}%`)} THEN 1 ELSE 2 END`;

  return { where, tier, score };
}
