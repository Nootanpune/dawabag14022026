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
  it('leaves plain values alone and stops at a sane depth', () => {
    expect(redact('text')).toBe('text');
    let deep: any = { v: 1 };
    for (let i = 0; i < 20; i++) deep = { deep };
    expect(JSON.stringify(redact(deep))).toContain('[nested]');
  });
});
