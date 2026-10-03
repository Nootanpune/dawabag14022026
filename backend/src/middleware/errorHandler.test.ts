// Security review Sprint 34 — health data and identifiers are blanked at any depth in the error log
import { redact } from './errorHandler';

describe('error log redaction', () => {
  it('blanks nested health and identity fields', () => {
    const out = JSON.stringify(redact({
      consent: true,
      allergies: ['penicillin'],
      members: [{ full_name: 'Asha', relationship: 'mother', age_years: 61, conditions: ['diabetes'] }],
      licences: [{ form: 'dl20', licence_number: 'MH-PUNE-123' }],
      reminder: { medicine_name: 'Metformin', dose: '1 tablet', times: ['08:00'] },
    }));
    for (const secret of ['penicillin', 'Asha', 'mother', 'diabetes', 'MH-PUNE-123', 'Metformin', '1 tablet', '61']) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('"form":"dl20"');
    expect(out).toContain('08:00');
  });
  it('blanks the personal details added in Sprints 35–40 (Sprint 41 review)', () => {
    const out = JSON.stringify(redact({
      prescriber_name: 'Dr Kale', prescriber_address: '39 College Road', prescriber_reg_no: 'MMC-77', patient_address: '12 Lake Road',
      items: [{ supplier_licence: 'MH-SUP-1', supplier_invoice_no: 'INV-9' }], registration_no: 'MSPC-1', disposition: 'release',
    }));
    for (const secret of ['Dr Kale', 'College Road', 'MMC-77', 'Lake Road', 'MH-SUP-1', 'INV-9', 'MSPC-1']) expect(out).not.toContain(secret);
    expect(out).toContain('"disposition":"release"');
  });
  it('leaves plain values alone and stops at a sane depth', () => {
    expect(redact('text')).toBe('text');
    let deep: any = { v: 1 };
    for (let i = 0; i < 20; i++) deep = { deep };
    expect(JSON.stringify(redact(deep))).toContain('[nested]');
  });
});
