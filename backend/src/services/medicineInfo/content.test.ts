import { DISCLAIMER, allText, infoFlags, parseInfoContent, publicSections, referenceLine, submitProblems } from './content';

describe('medicine information content (Sprint 33)', () => {
  it('fills every missing section with its empty value', () => {
    const c = parseInfoContent({});
    expect(c.overview).toBe('');
    expect(c.uses).toEqual([]);
    expect(c.side_effects).toEqual({ common: [], serious: [], contact_doctor_if: [] });
    expect(c.safety.alcohol).toEqual({ level: null, note: '' });
    expect(c.facts.habit_forming).toBeNull();
    expect(allText(c)).toEqual([]);
  });

  it('drops blank list points, half-written FAQs and references without a source', () => {
    const c = parseInfoContent({
      uses: ['Fever', '  ', 'Mild pain'],
      faqs: [{ question: 'Can I take it with food?', answer: 'Yes.' }, { question: 'Only a question', answer: '' }],
      references: [{ source: 'Manufacturer’s package insert', date: 'March 2026' }, { source: '', date: '2020' }],
    });
    expect(c.uses).toEqual(['Fever', 'Mild pain']);
    expect(c.faqs).toHaveLength(1);
    expect(c.references).toEqual([{ source: 'Manufacturer’s package insert', date: 'March 2026' }]);
  });

  it('refuses unknown sections, unknown safety levels and over-long text', () => {
    expect(() => parseInfoContent({ dosage_for_children: 'x' })).toThrow();
    expect(() => parseInfoContent({ safety: { alcohol: { level: 'probably_fine' } } })).toThrow();
    expect(() => parseInfoContent({ overview: 'x'.repeat(2001) })).toThrow(/2000 characters/);
    expect(() => parseInfoContent({ uses: Array(21).fill('a') })).toThrow(/At most 20/);
  });

  it('flags forbidden cure claims for the reviewer (C-19)', () => {
    const c = parseInfoContent({ overview: 'This tablet cures diabetes permanently.', uses: ['Relief of mild pain'] });
    expect(infoFlags(c)).toEqual([expect.objectContaining({ claim: 'cures', condition: 'diabetes' })]);
    expect(infoFlags(parseInfoContent({ overview: 'Used to lower high blood sugar with diet and exercise.' }))).toEqual([]);
  });

  it('cannot go to review without text and a source', () => {
    expect(submitProblems(parseInfoContent({}))).toEqual([
      'Write at least one section',
      expect.stringMatching(/source you used/),
    ]);
    expect(submitProblems(parseInfoContent({ overview: 'A pain reliever.', references: [{ source: 'Package insert' }] }))).toEqual([]);
    // a safety level alone is something written
    expect(submitProblems(parseInfoContent({ safety: { driving: { level: 'safe' } }, references: [{ source: 'PI' }] }))).toEqual([]);
  });

  it('gives buyers only the sections with something in them', () => {
    const s = publicSections(parseInfoContent({
      overview: 'Relieves pain and fever.',
      side_effects: { common: ['Nausea'] },
      safety: { alcohol: { level: 'unsafe', note: 'Avoid alcohol.' }, kidney: { level: 'consult_doctor' } },
      facts: { therapeutic_class: 'Analgesic', habit_forming: false },
      references: [{ source: 'Manufacturer’s package insert', date: 'Jan 2026' }],
    }));
    expect(Object.keys(s)).toEqual(['overview', 'side_effects', 'safety', 'facts', 'references']);
    expect(s.side_effects).toEqual({ common: ['Nausea'] });
    expect(s.safety).toEqual([
      { topic: 'alcohol', label: 'Alcohol', level: 'unsafe', level_label: 'Unsafe', note: 'Avoid alcohol.' },
      { topic: 'kidney', label: 'Kidney', level: 'consult_doctor', level_label: 'Consult your doctor', note: null },
    ]);
    expect(s.facts).toEqual({ therapeutic_class: 'Analgesic', habit_forming: false });
    expect(publicSections(parseInfoContent({}))).toEqual({});
  });

  it('prints references and the standing disclaimer in plain words', () => {
    expect(referenceLine({ source: 'Manufacturer’s package insert', date: 'March 2026' })).toBe('Manufacturer’s package insert, March 2026');
    expect(referenceLine({ source: 'Prescribing information' })).toBe('Prescribing information');
    expect(DISCLAIMER).toBe('For information only. Follow your doctor’s advice.');
  });
});
