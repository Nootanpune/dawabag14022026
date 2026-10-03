import { missingForRequired, normaliseProvenance, parseInvoiceDate, provenanceOf, provenanceRequiredFor, sameProvenance } from './rules';

const today = '2026-10-03';
describe('partner batch provenance rules (Sprint 39, C-02)', () => {
  it('reads the dates billing software prints', () => {
    expect(parseInvoiceDate('2026-09-30')).toBe('2026-09-30');
    expect(parseInvoiceDate('30/09/2026')).toBe('2026-09-30');
    expect(parseInvoiceDate('30-09-26')).toBe('2026-09-30');
    expect(parseInvoiceDate('30.09.2026')).toBe('2026-09-30');
    expect(parseInvoiceDate('46295')).toBe('2026-09-30');
    expect(parseInvoiceDate('31/02/2026')).toBe('invalid');
    expect(parseInvoiceDate('next week')).toBe('invalid');
    expect(parseInvoiceDate('')).toBeNull();
  });
  it('cleans what arrived; nothing given = null; bad dates warned, not kept', () => {
    expect(normaliseProvenance({ supplier_name: '  ', supplier_invoice_no: '' }, today).provenance).toBeNull();
    const n = normaliseProvenance({ supplier_name: ' S  Distributors ', supplier_licence_no: 'mh-20b-1', supplier_invoice_date: '2026-12-01' }, today);
    expect(n.provenance).toEqual({ supplier_name: 'S Distributors', supplier_licence_no: 'MH-20B-1', supplier_invoice_no: null, supplier_invoice_date: null });
    expect(n.warnings[0]).toMatch(/future/);
  });
  it('required for Schedule H1 and cold-chain batches only, all four details', () => {
    expect(provenanceRequiredFor({ drug_schedule: 'Schedule H1', cold_chain: false })).toBe(true);
    expect(provenanceRequiredFor({ drug_schedule: 'OTC', cold_chain: true })).toBe(true);
    expect(provenanceRequiredFor({ drug_schedule: 'Schedule H', cold_chain: false })).toBe(false);
    expect(missingForRequired(null)).toHaveLength(4);
    expect(missingForRequired({ supplier_name: 'A', supplier_licence_no: 'B', supplier_invoice_no: 'C', supplier_invoice_date: today })).toEqual([]);
  });
  it('compares and extracts', () => {
    const p = { supplier_name: 'A', supplier_licence_no: null, supplier_invoice_no: 'C', supplier_invoice_date: null };
    expect(sameProvenance(p, { ...p })).toBe(true);
    expect(sameProvenance(p, { ...p, supplier_invoice_no: 'D' })).toBe(false);
    expect(provenanceOf({ supplier_name: null })).toBeNull();
    expect(provenanceOf({ supplier_invoice_no: 'X' })).toMatchObject({ supplier_invoice_no: 'X' });
  });
});
