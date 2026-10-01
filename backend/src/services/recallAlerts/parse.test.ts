import { linesFromTable, parseCsv } from './parse';
import { batchKey } from './batchKey';

describe('recall alert list parsing (C-28)', () => {
  it('reads quoted CSV and finds columns by heading', () => {
    const csv = 'CDSCO NSQ list,,,\r\nS.No,Name of the Drug,Batch No.,Manufactured by,Reason for NSQ\r\n'
      + '1,"Paracetamol Tablets IP 500 mg","AB-12 34","Acme ""Labs"", Baddi",Dissolution\r\n,,,,\r\n';
    expect(linesFromTable(parseCsv(csv))).toEqual([{ drug_name: 'Paracetamol Tablets IP 500 mg', batch_number: 'AB-12 34',
      manufacturer: 'Acme "Labs", Baddi', reason: 'Dissolution' }]);
  });
  it('refuses a list without batch numbers', () => {
    expect(() => linesFromTable([['Drug', 'Reason'], ['X', 'Y']])).toThrow(/Batch/);
  });
  it('compares batch numbers on letters and digits only', () => {
    expect(batchKey('ab-12 34/')).toBe(batchKey('AB1234'));
  });
});
