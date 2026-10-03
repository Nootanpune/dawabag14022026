import { classOnlineProblem, parseProductClass } from './rules';

describe('product class and new-drug rules (Sprint 40, D6, C-10)', () => {
  it('reads the catalogue file column', () => {
    expect(parseProductClass('')).toBeUndefined();
    expect(parseProductClass('Medical device')).toBe('device');
    expect(parseProductClass('Ayurvedic')).toBe('ayush');
    expect(parseProductClass('Cosmetics')).toBe('cosmetic');
    expect(parseProductClass('drug')).toBe('drug');
    expect(parseProductClass('FMCG')).toBe('general');
    expect(parseProductClass('food')).toBe('invalid');
  });
  it('a device is never permitted; stopping it is always fine', () => {
    expect(classOnlineProblem({ name: 'BP monitor', product_class: 'device' }, 'permitted')).toMatch(/device track/);
    expect(classOnlineProblem({ name: 'BP monitor', product_class: 'device' }, 'restricted')).toBeNull();
  });
  it('a new drug is permitted only with a confirmation note', () => {
    const p = { name: 'Newmab', product_class: 'drug', is_new_drug: true };
    expect(classOnlineProblem(p, 'permitted')).toMatch(/new drug/);
    expect(classOnlineProblem(p, 'permitted', 'ok')).toMatch(/at least 20/);
    expect(classOnlineProblem(p, 'permitted', 'CDSCO approval 2025 seen; prescription only')).toBeNull();
    expect(classOnlineProblem({ name: 'Paracetamol', product_class: 'drug', is_new_drug: false }, 'permitted')).toBeNull();
  });
});
