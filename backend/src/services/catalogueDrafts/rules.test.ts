import { approvalProblems, DraftFields, draftWarnings, gstFromFile, prescriptionFor, suggestedDescription } from './rules';

const complete: DraftFields = {
  name: 'ZENTROMOL 650MG TAB', generic_name: 'Zentromol', composition: 'Zentromol 650 mg', strength: '650 mg', dosage_form: 'Tablet',
  drug_schedule: 'Schedule H', cold_chain: false, hsn_code: '30049099', gst_rate: 5, category: 'Fever & pain',
  description: 'Zentromol 650 mg tablet. Pack: 15 tablets.', storage_instructions: null, net_quantity: '15 TAB',
  manufacturer_name: 'Zentrix Remedies Pvt Ltd', manufacturer_address: 'Plot 1, Demo Industrial Area, Pune', country_of_origin: 'India',
};

describe('approvalProblems', () => {
  it('a complete draft is ready', () => {
    expect(approvalProblems(complete, true)).toEqual([]);
  });
  it('the schedule comes first and is never assumed', () => {
    expect(approvalProblems({ ...complete, drug_schedule: null }, true)).toEqual(['Choose the drug schedule']);
  });
  it('cold chain must be chosen, and a cold-chain product needs storage text (C-25)', () => {
    expect(approvalProblems(complete, false)).toContain('Choose whether it needs cold chain (2–8 °C)');
    expect(approvalProblems({ ...complete, cold_chain: true }, true).join(' ')).toMatch(/storage instructions/);
    expect(approvalProblems({ ...complete, cold_chain: true, storage_instructions: 'Store at 2–8 °C. Do not freeze.' }, true)).toEqual([]);
  });
  it('HSN must be 4, 6 or 8 digits and GST a known slab', () => {
    expect(approvalProblems({ ...complete, hsn_code: '30049' }, true).join(' ')).toMatch(/HSN/);
    expect(approvalProblems({ ...complete, gst_rate: 7 }, true).join(' ')).toMatch(/GST/);
    expect(approvalProblems({ ...complete, gst_rate: null }, true).join(' ')).toMatch(/GST/);
  });
  it('the C-17 declarations are needed for a listed product', () => {
    const p = approvalProblems({ ...complete, manufacturer_address: null, description: '', net_quantity: null }, true);
    expect(p).toEqual(expect.arrayContaining(['Add the manufacturer address', 'Add the net quantity (pack)']));
  });
  it('the description for buyers is optional (Sprint 31) but, when written, says something', () => {
    expect(approvalProblems({ ...complete, description: null }, true)).toEqual([]);
    expect(approvalProblems({ ...complete, description: '   ' }, true)).toEqual([]);
    expect(approvalProblems({ ...complete, description: 'Tab.' }, true).join(' ')).toMatch(/at least 10 characters, or leave it empty/);
  });
  it('Non-scheduled is a schedule like any other listed one (Sprint 31)', () => {
    expect(approvalProblems({ ...complete, drug_schedule: 'Non-scheduled' }, true)).toEqual([]);
  });
  it('Schedule X / NDPS need only the generic name: they are never listed (C-10)', () => {
    const bare = { ...complete, drug_schedule: 'Schedule X', category: null, hsn_code: null, description: null, manufacturer_address: null };
    expect(approvalProblems(bare, false)).toEqual([]);
    expect(approvalProblems({ ...bare, drug_schedule: 'NDPS', generic_name: null }, false)).toEqual(['Add the generic name']);
  });
});

describe('prescriptionFor (derived from the schedule, C-08)', () => {
  it.each([
    ['OTC', 'not needed'], ['Non-scheduled', 'not needed'], ['Schedule G', 'not needed'], ['Schedule H', 'needed'], ['Schedule H1', 'needed'],
    ['Schedule X', 'never sold online'], ['NDPS', 'never sold online'], [null, null],
  ])('%s → %s', (s, want) => expect(prescriptionFor(s)).toBe(want));
});

describe('suggestedDescription (minimal, no claims)', () => {
  it('generic name, strength, form and pack', () => {
    expect(suggestedDescription(complete)).toBe('Zentromol 650 mg tablet. Pack: 15 TAB.');
  });
  it('skips "none" strength and needs a generic name', () => {
    expect(suggestedDescription({ ...complete, strength: 'none', dosage_form: 'Cream', net_quantity: '20 g' })).toBe('Zentromol cream. Pack: 20 g.');
    expect(suggestedDescription({ ...complete, generic_name: null })).toBeNull();
  });
});

describe('draftWarnings', () => {
  it('medicine HSN taxed at 18% is pointed out', () => {
    expect(draftWarnings({ ...complete, gst_rate: 18 }).join(' ')).toMatch(/18%/);
  });
  it('a claim in the copy is pointed out (C-19)', () => {
    expect(draftWarnings({ ...complete, description: 'Cures diabetes permanently.' }).join(' ')).toMatch(/claim/);
  });
  it('an HSN whose usual GST differs from the product is pointed out, GST unchanged (Sprint 31)', () => {
    expect(draftWarnings({ ...complete, hsn_gst_rate: 12 }).join(' ')).toMatch(/HSN 30049099 usually has GST 12%, but this product is set to 5%/);
    expect(draftWarnings({ ...complete, hsn_gst_rate: 5 })).toEqual([]);
    expect(draftWarnings({ ...complete, hsn_gst_rate: null })).toEqual([]);
  });
  it('clean copy has no warnings', () => {
    expect(draftWarnings(complete)).toEqual([]);
  });
});

describe('gstFromFile', () => {
  it('keeps only accepted slabs', () => {
    expect(gstFromFile('12.00')).toBe(12);
    expect(gstFromFile(5)).toBe(5);
    expect(gstFromFile(7.5)).toBeNull();
    expect(gstFromFile(null)).toBeNull();
  });
});
