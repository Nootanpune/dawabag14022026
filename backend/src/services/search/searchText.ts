// Turns what a buyer typed into the pieces the product search matches on.
// Pure (no database), so the rules are unit-tested in searchText.test.ts.
//
// Indian buyers type brand names, generic (salt) names, partial words and
// misspellings ("paracetmol", "dolo 65", "pantop", "amoxycillin"). The search
// matches each meaningful word on its own and ranks rows by how many words fit.

export const MAX_QUERY_CHARS = 100;
export const MAX_WORDS = 6;
/** Words this long or longer are also matched by trigram similarity (typos). */
export const FUZZY_MIN_CHARS = 4;

export interface SearchText {
  /** Lower-case query, punctuation folded to spaces, single-spaced. */
  text: string;
  /** Every word, in order (each contributes to the rank). */
  words: string[];
  /** Words a product must match (all of them): the ones with a letter and ≥ 3
   *  characters; strengths and short fragments ("650", "d3") only rank, unless
   *  the query has nothing else. */
  required: string[];
}

export function parseSearchText(raw: unknown): SearchText | null {
  if (typeof raw !== 'string') return null;
  const text = raw
    .slice(0, MAX_QUERY_CHARS)
    .toLowerCase()
    .normalize('NFKC')
    // Keep letters (any script, with their vowel signs) and digits; %, _ and \ never reach a LIKE pattern
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (!text) return null;
  const words = [...new Set(text.split(' '))].slice(0, MAX_WORDS);
  const meaningful = words.filter((w) => w.length >= 3 && /\p{L}/u.test(w));
  return { text: words.join(' '), words, required: meaningful.length ? meaningful : words };
}

/** Whether a word is long enough for trigram similarity to be meaningful. */
export const isFuzzyWord = (w: string) => w.length >= FUZZY_MIN_CHARS;

/** Whether a typo-forgiving second pass could find more than the first. */
export const canSearchFuzzy = (st: SearchText) => st.required.some(isFuzzyWord);
