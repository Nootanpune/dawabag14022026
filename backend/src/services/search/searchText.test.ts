import { MAX_WORDS, canSearchFuzzy, parseSearchText } from './searchText';
import { buildProductSearchSql } from './productSearchSql';

describe('parseSearchText', () => {
  it('lower-cases, folds punctuation and spaces', () => {
    expect(parseSearchText('  Dolo-650   TAB ')).toEqual({ text: 'dolo 650 tab', words: ['dolo', '650', 'tab'], required: ['dolo', 'tab'] });
  });

  it('strips LIKE wildcards and backslashes', () => {
    expect(parseSearchText('para%_\\cet')!.text).toBe('para cet');
  });

  it('returns null for nothing searchable', () => {
    expect(parseSearchText('')).toBeNull();
    expect(parseSearchText(' %%% ')).toBeNull();
    expect(parseSearchText(undefined)).toBeNull();
    expect(parseSearchText(['a'])).toBeNull();
  });

  it('strengths and short fragments only rank when there is a real word', () => {
    expect(parseSearchText('vitamin d3')!.required).toEqual(['vitamin']);
    expect(parseSearchText('dolo 65')!.required).toEqual(['dolo']);
  });

  it('uses every word when none is a real word', () => {
    expect(parseSearchText('650')!.required).toEqual(['650']);
    expect(parseSearchText('d3 650')!.required).toEqual(['d3', '650']);
  });

  it('keeps letters of other scripts', () => {
    expect(parseSearchText('पैरासिटामोल 500')!.required).toEqual(['पैरासिटामोल']);
  });

  it('offers the fuzzy pass only for words of 4+ characters', () => {
    expect(canSearchFuzzy(parseSearchText('paracetmol')!)).toBe(true);
    expect(canSearchFuzzy(parseSearchText('pan 40')!)).toBe(false);
  });

  it('drops repeated words and caps the word count', () => {
    expect(parseSearchText('dolo dolo')!.words).toEqual(['dolo']);
    expect(parseSearchText('a1 b2 c3 d4 e5 f6 g7 h8')!.words).toHaveLength(MAX_WORDS);
  });
});

describe('buildProductSearchSql', () => {
  const st = parseSearchText('dolo 650')!;
  /** Collects parameters the way the service does: WHERE ones $1.., ranking ones $R0.. */
  function build(text = st, fuzzy = true) {
    const where: string[] = [];
    const rank: string[] = [];
    const sql = buildProductSearchSql(text, {
      fuzzy,
      whereParam: (v) => { where.push(v); return `$${where.length}`; },
      rankParam: (v) => { rank.push(v); return `$R${rank.length - 1}`; },
    });
    return { ...sql, where: sql.where, whereValues: where, rankValues: rank };
  }

  it('the WHERE takes only what matching needs; "650" only ranks', () => {
    const sql = build();
    expect(sql.whereValues).toEqual(['%dolo%', 'dolo', 'dolo 650']);
    expect(sql.where).toContain('$2 <% lower(p.name)');
    expect(sql.where).toContain('lower(p.generic_name) LIKE $1');
    expect(sql.where).toContain("plainto_tsquery('english', $3)");
    expect(sql.rankValues).toEqual(['%dolo%', 'dolo', '%650%', 'dol%', 'dolo 650', 'dolo 650%']);
  });

  it('every word adds to the score', () => {
    expect(build().score.split(' + ')).toHaveLength(2);
  });

  it('uses similarity only for words of 4+ characters', () => {
    const sql = build();
    expect(sql.score).toContain('word_similarity($R1, lower(p.name))');
    expect(sql.score).not.toMatch(/word_similarity\(\$R[^1]/);   // only "dolo" ($R1) is compared by similarity
  });

  it('the substring pass uses no trigram functions at all', () => {
    const sql = build(parseSearchText('paracetmol')!, false);
    expect(`${sql.where} ${sql.score} ${sql.tier}`).not.toMatch(/word_similarity|<%/);
    expect(sql.where).toContain('LIKE');
  });

  it('requires every real word of a multi-word query', () => {
    expect(build(parseSearchText('amoxycillin clavulanic')!).where).toMatch(/\) AND \(/);
  });

  it('ranks names equal to / starting with the query first', () => {
    expect(build().tier).toMatch(/NOT LIKE \$R3 THEN 2 WHEN .* = \$R4 THEN 0 WHEN .* LIKE \$R5 THEN 1 ELSE 2/);
  });
});
