import { H1Draft, h1RefusalMessage, missingH1Fields, registerKey, registerLicence } from './entry';

const full: H1Draft = {
  product_name: 'Alprazolam 0.25 mg', quantity: 10, batch_number: 'B1', patient_name: 'Asha', patient_address: '1 Road, Nashik',
  prescriber_name: 'Dr Rao', prescriber_address: 'Rao Clinic, Nashik', prescriber_reg_no: null, prescription_id: 'rx',
  pharmacist_name: 'Ph One', pharmacist_reg_no: 'MH-123', seller_licence_no: 'MH-NSK-20-1',
};

describe('Schedule H1 register entry (C-09)', () => {
  it('a complete entry needs nothing; the prescriber registration number is optional', () => {
    expect(missingH1Fields(full)).toEqual([]);
    expect(h1RefusalMessage(full, 'dawabag')).toBeNull();
  });

  it('a missing prescriber address refuses dispatch with what to fill in and where', () => {
    const m = h1RefusalMessage({ ...full, prescriber_address: '  ' }, 'dawabag')!;
    expect(m).toMatch(/prescriber's \(doctor's\) address is missing/);
    expect(m).toMatch(/Prescriptions missing H1 details/);
    expect(m).toMatch(/Nothing was dispatched/);
  });

  it('no placeholder counts as a value', () => {
    expect(missingH1Fields({ ...full, patient_name: 'Not recorded', prescriber_name: 'not recorded ' }).map((f) => f.field))
      .toEqual(['patient_name', 'prescriber_name']);
  });

  it('a partner is told to ask Dawabag for prescription details and lists several gaps plainly', () => {
    const m = h1RefusalMessage({ ...full, prescriber_address: null, batch_number: null }, 'partner')!;
    expect(m).toMatch(/address and batch number are missing/);
    expect(m).toMatch(/Ask Dawabag's pharmacist/);
  });

  it('the register is the seller retail licence (Form 20, then 21), one per seller licence', () => {
    expect(registerLicence([{ form: 'dl20b', number: 'W-1' }, { form: 'dl21', number: 'R-21' }, { form: 'dl20', number: 'R-20' }]))
      .toEqual({ form: 'dl20', number: 'R-20' });
    expect(registerLicence([{ form: 'dl20b', number: 'W-1' }])).toEqual({ form: 'dl20b', number: 'W-1' });
    expect(registerLicence([])).toBeNull();
    expect(registerKey('dawabag', null, 'mh-nsk/20 1')).toBe('dawabag:MHNSK201');
    expect(registerKey('partner', 'p1', 'MH-1')).toBe('partner:p1:MH1');
    expect(() => registerKey('partner', null, 'MH-1')).toThrow();
  });
});
