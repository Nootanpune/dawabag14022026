import { parseSearchSort, sortPrefix } from './productSearch.service';
import { uniqueTerms } from './didYouMean';

jest.mock('../../config/database', () => ({ pool: {}, query: jest.fn(), queryOne: jest.fn() }));

describe('search sort (Sprint 25)', () => {
  it('defaults to relevance for anything unknown', () => {
    expect(parseSearchSort(undefined)).toBe('relevance');
    expect(parseSearchSort('price; drop table')).toBe('relevance');
    expect(parseSearchSort('price_asc')).toBe('price_asc');
    expect(parseSearchSort('price_desc')).toBe('price_desc');
  });

  it('puts the price before the relevance keys only when asked', () => {
    expect(sortPrefix('relevance', 'm')).toBe('');
    expect(sortPrefix(undefined, 'm')).toBe('');
    expect(sortPrefix('price_asc', 'pg')).toBe('pg.sort_price ASC, ');
    expect(sortPrefix('price_desc', 'm')).toBe('m.sort_price DESC, ');
  });
});

describe('did you mean', () => {
  it('drops case-insensitive repeats and keeps at most three', () => {
    expect(uniqueTerms(['Paracetamol', 'paracetamol', ' Pantoprazole ', '', 'Cetirizine', 'Ceftriaxone']))
      .toEqual(['Paracetamol', 'Pantoprazole', 'Cetirizine']);
  });
});
