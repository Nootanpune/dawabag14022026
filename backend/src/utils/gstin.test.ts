// GSTIN checks (Sprint 28). All GSTINs here are made up; their check characters were
// computed with the standard mod-36 scheme, independently of this code.
import { checkGstin, gstinCheckChar, gstinStateProblem } from './gstin';

describe('gstinCheckChar', () => {
  it.each([
    ['27ABCDE1234F1Z', '0'],
    ['27AAACT2727Q1Z', 'W'],
    ['29ABCDE1234F1Z', 'W'],
    ['27PQRSX9876K2Z', 'P'],
    ['27ZZZZZ0000Z1Z', 'Q'],
  ])('%s → %s', (first14, expected) => {
    expect(gstinCheckChar(first14)).toBe(expected);
  });
});

describe('checkGstin', () => {
  it('accepts a well-formed GSTIN with the right check character, in any case and with spaces', () => {
    expect(checkGstin('27ABCDE1234F1Z0')).toEqual({ ok: true, gstin: '27ABCDE1234F1Z0', stateCode: '27', pan: 'ABCDE1234F' });
    expect(checkGstin(' 27aaact2727q1zw ')).toMatchObject({ ok: true, gstin: '27AAACT2727Q1ZW' });
  });

  it('refuses a wrong check character (a typing mistake)', () => {
    const r = checkGstin('27ABCDE1234F1Z5');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/last character does not match/);
  });

  it('refuses a swapped pair of characters', () => {
    expect(checkGstin('27BACDE1234F1Z0').ok).toBe(false);
  });

  it('refuses the wrong length and the wrong shape in plain words', () => {
    const short = checkGstin('27ABCDE1234F1Z');
    expect(!short.ok && short.reason).toMatch(/exactly 15 characters/);
    const shape = checkGstin('27ABCDE1234F1X0');   // 14th character must be Z
    expect(!shape.ok && shape.reason).toMatch(/not a GSTIN/);
    expect(checkGstin('').ok).toBe(false);
    expect(checkGstin(null).ok).toBe(false);
  });

  it('refuses a first two digits that are no state code', () => {
    const first14 = '45ABCDE1234F1Z';
    const r = checkGstin(first14 + gstinCheckChar(first14));
    expect(!r.ok && r.reason).toMatch(/not a state code/);
  });
});

describe('gstinStateProblem', () => {
  it('accepts a Maharashtra GSTIN (27) at a Maharashtra address', () => {
    expect(gstinStateProblem('27ABCDE1234F1Z0', 'Maharashtra')).toBeNull();
    expect(gstinStateProblem('27ABCDE1234F1Z0', 'MH')).toBeNull();
  });

  it('refuses a GSTIN of another state, saying which code the state has', () => {
    expect(gstinStateProblem('29ABCDE1234F1ZW', 'Maharashtra')).toMatch(/starts with 29 but Maharashtra is state code 27/);
  });

  it('asks for a recognisable state name', () => {
    expect(gstinStateProblem('27ABCDE1234F1Z0', 'Mars')).toMatch(/not a state we recognise/);
  });
});
