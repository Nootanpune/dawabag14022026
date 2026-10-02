// Sprint 30 migration (database/25_sprint30_party_licences.sql) agrees with the code:
// the forms the database accepts, the order the summary trigger picks the "first"
// licence in, and how older single-licence values are mapped. A mismatch would make the
// derived summary (that every older check reads) differ from licenceSummary().
import fs from 'fs';
import path from 'path';
import { DAWABAG_DRUG_TYPES, FORM_ORDER, LICENCE_FORMS, normaliseForm } from './forms';

const sql = fs.readFileSync(path.resolve(__dirname, '../../../../database/25_sprint30_party_licences.sql'), 'utf8');
const list = (s: string) => [...s.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);

describe('Sprint 30 migration', () => {
  it('accepts exactly the licence forms the code knows', () => {
    const check = sql.match(/form\s+VARCHAR\(10\) NOT NULL CHECK \(form IN \(([^)]*)\)\)/)![1];
    expect(new Set(list(check))).toEqual(new Set(LICENCE_FORMS));
  });
  it('the summary trigger ranks forms in FORM_ORDER (first licence = what licenceSummary picks)', () => {
    const rank = sql.match(/array_position\(ARRAY\[([^\]]*)\]::varchar\[\], f\)/)![1];
    expect(list(rank)).toEqual(FORM_ORDER);
  });
  it('the summary columns on vendors and users accept every form', () => {
    for (const table of ['vendors', 'users']) {
      const c = sql.match(new RegExp(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_drug_license_type_check CHECK \\(drug_license_type IN \\(([^)]*)\\)\\)`))![1];
      expect(list(c)).toEqual(expect.arrayContaining([...LICENCE_FORMS, 'none']));
    }
  });
  it('older single values map to a form; anything else becomes a named "other" licence', () => {
    // vendors.drug_license_type / users.drug_license_type held only these (owner decision 30 Sep 2026)
    for (const old of ['dl20', 'dl21', 'dl20b', 'dl21b']) expect(normaliseForm(old)).toBe(old);
    expect(normaliseForm('none')).toBeNull();
    expect(sql).toContain("ELSE 'Drug licence (form not recorded)' END");
  });
  it("Dawabag's register drug types map to forms, and the register accepts them", () => {
    const c = sql.match(/business_licences_licence_type_check CHECK \(licence_type IN \(([^)]*)\)\)/)![1];
    for (const [type, form] of Object.entries(DAWABAG_DRUG_TYPES)) {
      expect(list(c)).toContain(type);
      expect(normaliseForm(type)).toBe(form);
    }
  });
});
