import { cheapestSame, dosageForm, isSameMedicine, medicineKey, normaliseGeneric, releaseType, strengthNumbers } from './sameMedicine';

const med = (name: string, generic: string | null, extra: Partial<{ drug_schedule: string; net_quantity: string | null }> = {}) =>
  ({ name, generic_name: generic, drug_schedule: extra.drug_schedule ?? 'OTC', net_quantity: extra.net_quantity ?? null });

describe('sameMedicine', () => {
  it('normalises generic names like the SQL does', () => {
    expect(normaliseGeneric('  Povidone-Iodine ')).toBe('povidone iodine');
    expect(normaliseGeneric('Metformin + Glimepiride')).toBe('metformin glimepiride');
    expect(normaliseGeneric(null)).toBe('');
  });

  it('reads every strength number in the name', () => {
    expect(strengthNumbers('Paracetamol 650 mg Tablet')).toEqual(['650']);
    expect(strengthNumbers('Cholecalciferol 60,000 IU Capsule')).toEqual(['60000']);
    expect(strengthNumbers('Paracetamol 250 mg/5 ml Oral Suspension')).toEqual(['5', '250']);
    expect(strengthNumbers('Amoxicillin 500 mg + Clavulanic Acid 125 mg Tablet')).toEqual(['125', '500']);
  });

  it('tells dosage forms and release types apart', () => {
    expect(dosageForm('X 650 Tablet')).toBe('tablet');
    expect(dosageForm('X 500 Capsule')).toBe('capsule');
    expect(dosageForm('X 250 mg/5 ml Oral Suspension')).toBe('liquid');
    expect(releaseType('Metoprolol Succinate 25 mg Extended-release Tablet')).toBe('modified');
    expect(releaseType('Pantoprazole 40 mg Gastro-resistant Tablet')).toBe('gastro');
    expect(releaseType('Paracetamol 650 mg Tablet')).toBe('plain');
  });

  it('matches a brand and a generic of the same salt, strength and form', () => {
    expect(isSameMedicine(med('Fevogen 650 Tablet', 'Paracetamol'), med('Paracetamol 650 mg Tablet', 'paracetamol'))).toBe(true);
  });

  it('never matches a different strength, form, release type, schedule or pack', () => {
    const base = med('Paracetamol 650 mg Tablet', 'Paracetamol', { net_quantity: '15 tablets' });
    expect(isSameMedicine(base, med('Paracetamol 500 mg Tablet', 'Paracetamol'))).toBe(false);
    expect(isSameMedicine(base, med('Paracetamol 650 mg Capsule', 'Paracetamol'))).toBe(false);
    expect(isSameMedicine(base, med('Paracetamol 650 mg SR Tablet', 'Paracetamol'))).toBe(false);
    expect(isSameMedicine(base, med('Paracetamol 650 mg Tablet', 'Paracetamol', { drug_schedule: 'Schedule H' }))).toBe(false);
    expect(isSameMedicine(base, med('Paracetamol 650 mg Tablet', 'Paracetamol', { net_quantity: '10 tablets' }))).toBe(false);
    expect(isSameMedicine(base, med('Paracetamol 650 mg Tablet', 'Paracetamol', { net_quantity: '15 Tablets' }))).toBe(true);
  });

  it('gives no key without a generic name or a strength', () => {
    expect(medicineKey(med('Oral Rehydration Salts Powder', 'Oral Rehydration Salts'))).toBeNull();
    expect(medicineKey(med('Fevogen 650 Tablet', null))).toBeNull();
  });

  it('picks the cheapest in-stock same medicine that costs less', () => {
    const line = { id: 'a', price_paise: 3000, ...med('Fevogen 650 Tablet', 'Paracetamol') };
    const p = (id: string, name: string, in_stock = true) => ({ id, in_stock, ...med(name, 'Paracetamol') });
    const pick = cheapestSame(line, [
      { product: p('a', 'Fevogen 650 Tablet'), price_paise: 1000 },            // itself
      { product: p('b', 'Paracetamol 650 mg Tablet'), price_paise: 2500 },
      { product: p('c', 'Paracetamol 650 mg Tablet', false), price_paise: 900 }, // out of stock
      { product: p('d', 'Paracetamol 500 mg Tablet'), price_paise: 800 },      // other strength
      { product: p('e', 'Calpara 650 Tablet'), price_paise: 2200 },
      { product: p('f', 'Pyrexa 650 Tablet'), price_paise: 3000 },             // not cheaper
    ]);
    expect(pick?.product.id).toBe('e');
    expect(cheapestSame(line, [{ product: p('f', 'Pyrexa 650 Tablet'), price_paise: 3100 }])).toBeNull();
  });
});
