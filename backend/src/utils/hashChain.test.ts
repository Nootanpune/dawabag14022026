import {
  GENESIS_HASH, auditCanonical, canonField, canonTimestamp, canonicalText, h1Canonical, sha256Hex, walkChain,
  type ChainLink, type H1ChainRow,
} from './hashChain';

describe('canonical serialisation for the chained registers (C-09, C-46)', () => {
  it('writes NULL explicitly and never confuses it with an empty value', () => {
    expect(canonField('x', null)).toBe('x=~');
    expect(canonField('x', undefined)).toBe('x=~');
    expect(canonField('x', '')).toBe('x=0:');
    expect(canonField('x', '~')).toBe('x=1:~');
  });

  it('prefixes values with their UTF-8 byte length, so no value can fake a field boundary', () => {
    expect(canonField('name', 'Rāmesh')).toBe('name=7:Rāmesh');
    const sneaky = canonicalText('v1', [['a', 'x\nb=1:y'], ['b', null]]);
    const honest = canonicalText('v1', [['a', 'x'], ['b', 'y']]);
    expect(sneaky).not.toBe(honest);
    expect(sneaky).toBe('v1\na=7:x\nb=1:y\nb=~');
  });

  it('timestamps are UTC with milliseconds whatever the time zone they were written in', () => {
    expect(canonTimestamp(new Date('2026-10-03T10:05:06.789+05:30'))).toBe('2026-10-03T04:35:06.789Z');
    expect(canonTimestamp('2026-10-03T04:35:06Z')).toBe('2026-10-03T04:35:06.000Z');
    expect(() => canonTimestamp('not a date')).toThrow();
  });

  it('numbers, bigints and booleans as plain text', () => {
    expect(canonField('n', 12)).toBe('n=2:12');
    expect(canonField('n', BigInt('9007199254740993'))).toBe('n=16:9007199254740993');
    expect(canonField('b', false)).toBe('b=5:false');
  });

  it('matches the database functions byte for byte (golden value from dawabag_canon in PostgreSQL)', () => {
    const t = canonicalText('v1', [['a', 'Rāmesh 💊'], ['b', null], ['c', new Date('2026-10-03T10:05:06.789+05:30')], ['d', '']]);
    expect(t).toBe('v1\na=12:Rāmesh 💊\nb=~\nc=24:2026-10-03T04:35:06.789Z\nd=0:');
    expect(sha256Hex(t)).toBe('5af02bd7cf8a5e18cfea852a9161dee8287a4b0780a5e27f7b372cb002c37093');
  });

  const h1: H1ChainRow = {
    register_key: 'dawabag:DL20', entry_no: '1', id: '00000000-0000-4000-8000-000000000001', dispensed_at: '2026-10-03T04:35:06.789Z',
    seller_type: 'dawabag', partner_id: null, seller_licence_no: 'DL-20', order_id: 'o', order_item_id: 'oi', product_id: 'p',
    product_name: 'Alprazolam 0.25 mg', batch_number: 'B1', quantity: 10, patient_name: 'P', patient_address: 'A',
    prescriber_name: 'Dr X', prescriber_address: 'Clinic', prescriber_reg_no: null, prescription_id: 'rx',
    pharmacist_name: 'Ph', pharmacist_reg_no: 'R1', prev_hash: GENESIS_HASH,
  };

  it('every H1 field is in the text, in order, including empty optional ones', () => {
    const t = h1Canonical(h1).split('\n');
    expect(t[0]).toBe('dawabag-h1-register-v1');
    expect(t).toContain('prescriber_reg_no=~');
    expect(t).toContain('partner_id=~');
    expect(t[t.length - 1]).toBe(`prev_hash=64:${GENESIS_HASH}`);
    expect(t.length).toBe(23);
    expect(h1Canonical({ ...h1, prescriber_reg_no: '' })).not.toBe(h1Canonical(h1));
  });

  it('the audit text carries JSON exactly as the database prints it', () => {
    const t = auditCanonical({ chain_seq: 2, id: 'i', created_at: new Date('2026-10-03T00:00:00Z'), user_id: null, action: 'x',
      entity: null, entity_id: null, metadata: null, ip_address: '10.0.0.1/32', user_agent: null,
      old_value: null, new_value: '{"a": [1, "x"], "b": 2}', performed_by: null, notes: null, prev_hash: 'h' });
    expect(t).toContain('new_value=23:{"a": [1, "x"], "b": 2}');
    expect(t.split('\n')[0]).toBe('dawabag-audit-v1');
  });
});

describe('walking a chain', () => {
  function chain(n: number): ChainLink[] {
    const out: ChainLink[] = [];
    let prev = GENESIS_HASH;
    for (let i = 1; i <= n; i++) {
      const canonical = `row ${i} prev ${prev}`;
      const row_hash = sha256Hex(canonical);
      out.push({ no: i, id: `id${i}`, prev_hash: prev, row_hash, canonical });
      prev = row_hash;
    }
    return out;
  }

  it('a good chain passes and reports its head', () => {
    const c = chain(4);
    expect(walkChain(c)).toEqual({ ok: true, checked: 4, last_no: 4, head_hash: c[3].row_hash, first_break: null });
    expect(walkChain([])).toMatchObject({ ok: true, checked: 0 });
  });

  it('a changed entry is reported as the first break', () => {
    const c = chain(5);
    c[2] = { ...c[2], canonical: 'row 3 changed' };
    const r = walkChain(c);
    expect(r.ok).toBe(false);
    expect(r.first_break).toMatchObject({ no: 3, id: 'id3' });
    expect(r.first_break!.problem).toMatch(/changed after it was written/);
    expect(r.checked).toBe(2);
  });

  it('a removed entry shows as a gap; a re-hashed entry breaks the next link', () => {
    const c = chain(5);
    expect(walkChain([c[0], c[1], c[3], c[4]]).first_break).toMatchObject({ no: 4, problem: 'Entries 3 are missing' });
    const forged = { ...c[1], canonical: 'forged', row_hash: sha256Hex('forged') };
    expect(walkChain([c[0], forged, c[2]]).first_break).toMatchObject({ no: 3 });
  });

  it('an unsealed entry is a break; a partial check starts from a stored hash', () => {
    const c = chain(3);
    expect(walkChain([c[0], { ...c[1], row_hash: null }]).first_break!.problem).toMatch(/never sealed/);
    expect(walkChain(c.slice(1), 2, c[0].row_hash!)).toMatchObject({ ok: true, checked: 2, last_no: 3 });
  });
});
