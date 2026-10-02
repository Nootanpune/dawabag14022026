import { packComparable, packSize, pricePerUnit, rankSubstitutes, savePct, unitLabel } from './substitutes';
import { routeOf, isSameMedicine } from './sameMedicine';

const med = (id: string, name: string, price: number, net: string | null, extra: Partial<{ generic: string; schedule: string; in_stock: boolean }> = {}) => ({
  id, name, generic_name: extra.generic ?? 'Paracetamol', drug_schedule: extra.schedule ?? 'OTC', net_quantity: net,
  price_paise: price, in_stock: extra.in_stock ?? true,
});

describe('substitutes (Sprint 33)', () => {
  it('reads pack sizes', () => {
    expect(packSize('10 tablets')).toEqual({ count: 10, unit: 'unit', label: 'tablet' });
    expect(packSize('1 x 15 TAB')).toEqual({ count: 15, unit: 'unit', label: 'tablet' });
    expect(packSize('2x10 caps')).toEqual({ count: 20, unit: 'unit', label: 'capsule' });
    expect(packSize('Strip of 10 capsules')).toEqual({ count: 10, unit: 'unit', label: 'capsule' });
    expect(packSize('100 ml')).toEqual({ count: 100, unit: 'ml', label: 'ml' });
    expect(packSize('60ml')).toEqual({ count: 60, unit: 'ml', label: 'ml' });
    expect(packSize('1 L')).toEqual({ count: 1000, unit: 'ml', label: 'ml' });
    expect(packSize('30 gm')).toEqual({ count: 30, unit: 'g', label: 'g' });
    expect(packSize('one strip')).toBeNull();
    expect(packSize(null)).toBeNull();
  });

  it('compares packs only of the same kind', () => {
    expect(packComparable('10 tablets', '15 TAB')).toBe(true);
    expect(packComparable('100 ml', '60 ml')).toBe(true);
    expect(packComparable('10 tablets', '100 ml')).toBe(false);
    expect(packComparable('one strip', 'One  strip')).toBe(true);
    expect(packComparable('one strip', '10 tablets')).toBe(false);
    expect(packComparable(null, null)).toBe(true);
  });

  it('prices per unit and works out the saving', () => {
    expect(pricePerUnit(3000, '10 tablets')).toBe(300);
    expect(pricePerUnit(3000, 'one strip')).toBe(3000);
    expect(unitLabel('15 TAB')).toBe('per tablet');
    expect(unitLabel('100 ml')).toBe('per ml');
    expect(unitLabel(null)).toBe('per pack');
    expect(savePct(300, 150)).toBe(50);
    expect(savePct(300, 299.5)).toBeNull();          // under 1 %
    expect(savePct(300, 300)).toBeNull();
    expect(savePct(300, 400)).toBeNull();
  });

  it('tells routes apart, so eye drops never match oral drops', () => {
    expect(routeOf('Ciprofloxacin 0.3% Eye Drops')).toBe('eye');
    expect(routeOf('Ciprofloxacin 0.3% Ear Drops')).toBe('ear');
    expect(routeOf('Paracetamol 100 mg/ml Oral Drops')).toBe('oral');
    expect(routeOf('Budesonide 0.5 mg Respules')).toBe('inhaled');
    expect(routeOf('Ceftriaxone 1 g Injection')).toBe('injection');
    expect(isSameMedicine(
      { name: 'Ciprofloxacin 0.3% Eye Drops', generic_name: 'Ciprofloxacin', drug_schedule: 'Schedule H' },
      { name: 'Ciprofloxacin 0.3% Ear Drops', generic_name: 'Ciprofloxacin', drug_schedule: 'Schedule H' })).toBe(false);
  });

  it('lists every same medicine, cheapest per unit first, never the product itself', () => {
    const current = med('cur', 'Fevogen 650 Tablet', 3000, '10 tablets');
    const ranked = rankSubstitutes(current, [
      current,
      med('a', 'Paracetamol 650 mg Tablet', 3000, '15 tablets'),              // 200 / tablet
      med('b', 'Calpara 650 Tablet', 1000, '10 tablets', { in_stock: false }), // 100 / tablet, out of stock
      med('c', 'Pyrexa 650 Tablet', 4000, '10 tablets'),                      // 400 / tablet — dearer
      med('d', 'Paracetamol 500 mg Tablet', 500, '10 tablets'),               // other strength
      med('e', 'Paracetamol 650 mg SR Tablet', 500, '10 tablets'),            // other release
      med('f', 'Paracetamol 650 mg Tablet', 500, '100 ml'),                   // pack not comparable
      med('g', 'Paracetamol 650 mg Tablet', 500, '10 tablets', { schedule: 'Schedule H' }),
      med('h', 'Ibugesic 650 Tablet', 500, '10 tablets', { generic: 'Ibuprofen' }),
      med('i', 'Febrinil 650 Tablet', 2000, '10 tablets'),                    // 200 / tablet, same as a
    ]);
    expect(ranked.map((r) => r.product.id)).toEqual(['b', 'i', 'a', 'c']);
    expect(ranked.map((r) => r.save_pct)).toEqual([66, 33, 33, null]);
    expect(ranked[0].unit_label).toBe('per tablet');
    expect(ranked[0].product.in_stock).toBe(false);   // shown, marked out of stock
  });

  it('lists nothing when the medicine cannot be identified safely', () => {
    expect(rankSubstitutes(med('x', 'ORS Powder', 100, null), [med('y', 'ORS Powder', 50, null)])).toEqual([]);
    expect(rankSubstitutes({ ...med('x', 'Fevogen 650 Tablet', 100, null), generic_name: null }, [med('y', 'Paracetamol 650 Tablet', 50, null)])).toEqual([]);
  });
});
