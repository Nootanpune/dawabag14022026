// src/utils/claimsCheck.ts — flags product copy that may claim to cure or
// prevent a disease the law forbids advertising remedies for (Rulebook C-19:
// Drugs and Magic Remedies (Objectionable Advertisements) Act 1954 Schedule and
// Drugs Rules Schedule J). A flag does not block saving; the pharmacist must
// review the copy before it is shown (products.content_status).
const CLAIM_WORDS = ['cure', 'cures', 'cured', 'curing', 'prevent', 'prevents', 'prevention', 'eliminate', 'eradicate',
  'guaranteed', 'permanent relief', 'miracle', 'magic', 'reverse', 'reverses'];

// Conditions named in the 1954 Act Schedule / Schedule J (abridged; the pharmacist has the full list)
const RESTRICTED_CONDITIONS = ['aids', 'hiv', 'cancer', 'tumour', 'tumor', 'diabetes', 'blood pressure', 'hypertension',
  'heart disease', 'stroke', 'paralysis', 'epilepsy', 'asthma', 'tuberculosis', 'leprosy', 'cataract', 'glaucoma',
  'kidney stone', 'gall stone', 'obesity', 'fairness', 'infertility', 'impotence', 'sexual', 'premature ageing',
  'baldness', 'hair loss', 'arthritis', 'rheumatism', 'insanity', 'mental illness', 'venereal', 'fits', 'deafness',
  'blindness', 'goitre', 'jaundice', 'hepatitis', 'dropsy', 'piles', 'fistula', 'appendicitis', 'height', 'memory'];

export interface ClaimFlag { condition: string; claim: string; excerpt: string }

export function findRestrictedClaims(...texts: (string | null | undefined)[]): ClaimFlag[] {
  const flags: ClaimFlag[] = [];
  for (const raw of texts) {
    if (!raw) continue;
    // Check each sentence: a claim word and a restricted condition together
    for (const sentence of raw.split(/(?<=[.!?\n])\s*/)) {
      const lower = sentence.toLowerCase();
      const claim = CLAIM_WORDS.find((w) => new RegExp(`\\b${w}\\b`).test(lower));
      if (!claim) continue;
      const condition = RESTRICTED_CONDITIONS.find((c) => new RegExp(`\\b${c}\\b`).test(lower));
      if (condition) flags.push({ condition, claim, excerpt: sentence.trim().slice(0, 200) });
    }
  }
  return flags;
}
