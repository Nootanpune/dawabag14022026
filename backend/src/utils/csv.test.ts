// Sprint 48: every CSV the API builds goes through toCsv (H1 register, sales to doctors, destruction
// register, accounts reports, the "not in catalogue" / "no draft yet" import lists). A cell that a
// spreadsheet would run as a formula is neutralised with a leading quote (CSV injection, C-41).
import { toCsv } from './csv';

const one = (v: unknown) => toCsv(['a'], [{ a: v }]).split('\n')[1];

describe('toCsv neutralises spreadsheet formulas', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['+91 98765 43210', "'+91 98765 43210"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tcmd', "'\tcmd"],
    ['=HYPERLINK("http://x","y")', `"'=HYPERLINK(""http://x"",""y"")"`],
  ])('%j → %j', (input, out) => expect(one(input)).toBe(out));

  it('a carriage return at the start is neutralised and the cell quoted', () => {
    expect(one('\r=1')).toBe(`"'\r=1"`);
  });

  it('plain numbers (also negative) and ordinary text are left alone', () => {
    expect(one(-5)).toBe('-5');
    expect(one('-12.50')).toBe('-12.50');
    expect(one(42)).toBe('42');
    expect(one('Paracetamol 500')).toBe('Paracetamol 500');
    expect(one('a=b')).toBe('a=b');
  });

  it('commas, quotes and new lines are quoted; nulls are empty; dates are ISO', () => {
    expect(toCsv(['a', 'b', 'c'], [{ a: 'x,y', b: 'say "hi"', c: null }]).split('\n')[1]).toBe('"x,y","say ""hi""",');
    expect(one(new Date('2026-10-04T00:00:00Z'))).toBe('2026-10-04T00:00:00.000Z');
  });
});
