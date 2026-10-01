import { findRestrictedClaims } from './claimsCheck';

describe('findRestrictedClaims (C-19)', () => {
  it('flags a cure claim for a restricted condition', () => {
    const f = findRestrictedClaims('Relieves pain. This tablet cures diabetes in weeks.');
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ condition: 'diabetes', claim: 'cures' });
  });
  it('ignores plain indications and claims about unrestricted conditions', () => {
    expect(findRestrictedClaims('Relieves headache and mild fever.')).toEqual([]);
    expect(findRestrictedClaims('Helps prevent dry skin.')).toEqual([]);
  });
  it('checks sentence by sentence, not across sentences', () => {
    expect(findRestrictedClaims('Prevents dehydration. Not for diabetes patients.')).toEqual([]);
  });
  it('handles empty fields', () => {
    expect(findRestrictedClaims(null, undefined, '')).toEqual([]);
  });
});
