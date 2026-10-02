// Sprint 35 — pharmacist check on every order (C-08): the pure rules.
import { abuseSignals, canDecide, mayDispatch, mayPack, notReleasedMessage, orderCheckState, reasonProblem } from './rules';

describe('pharmacist check gate', () => {
  it('packing needs a release', () => {
    expect(mayPack('released')).toBe(true);
    for (const s of ['pending', 'held', 'rejected', 'not_recorded', null, undefined]) expect(mayPack(s as any)).toBe(false);
  });
  it('dispatch also lets through parcels packed before Sprint 35', () => {
    expect(mayDispatch('released')).toBe(true);
    expect(mayDispatch('not_recorded')).toBe(true);
    expect(mayDispatch('pending')).toBe(false);
    expect(mayDispatch('held')).toBe(false);
  });
  it('says plainly why packing is refused', () => {
    expect(notReleasedMessage('pending', null, 'dawabag')).toMatch(/Waiting for the pharmacist check/);
    expect(notReleasedMessage('pending', null, 'partner')).toMatch(/Your registered pharmacist must check this shipment/);
    expect(notReleasedMessage('held', 'Call the buyer about the dose', 'dawabag')).toMatch(/On hold by the pharmacist: Call the buyer about the dose/);
  });
});

describe('decisions', () => {
  it('only pending or held shipments can be decided; a hold cannot be held again', () => {
    expect(canDecide('pending', 'release')).toBe(true);
    expect(canDecide('pending', 'hold')).toBe(true);
    expect(canDecide('held', 'release')).toBe(true);
    expect(canDecide('held', 'reject')).toBe(true);
    expect(canDecide('held', 'hold')).toBe(false);
    expect(canDecide('released', 'reject')).toBe(false);
    expect(canDecide('not_recorded', 'release')).toBe(false);
  });
  it('a hold or a refusal needs a reason', () => {
    expect(reasonProblem('release', undefined)).toBeNull();
    expect(reasonProblem('hold', ' ab ')).toMatch(/on hold/);
    expect(reasonProblem('reject', '')).toMatch(/cannot be supplied/);
    expect(reasonProblem('reject', 'Interacts with warfarin')).toBeNull();
  });
});

describe('order summary for the buyer', () => {
  const sh = (status: string, pharmacist_check: string) => ({ status, pharmacist_check });
  it('released only when every live shipment is', () => {
    expect(orderCheckState([sh('pending', 'released'), sh('pending', 'pending')])).toBe('pending');
    expect(orderCheckState([sh('pending', 'released'), sh('packed', 'released')])).toBe('released');
    expect(orderCheckState([sh('pending', 'released'), sh('pending', 'held')])).toBe('held');
    expect(orderCheckState([sh('cancelled', 'pending'), sh('pending', 'released')])).toBe('released');
  });
  it('old orders and refused ones', () => {
    expect(orderCheckState([sh('delivered', 'not_recorded')])).toBe('not_recorded');
    expect(orderCheckState([sh('cancelled', 'rejected'), sh('cancelled', 'pending')])).toBe('rejected');
  });
});

describe('signals for the pharmacist', () => {
  const line = { product_name: 'X', quantity: 1, drug_schedule: 'OTC', max_qty_per_order: 10, habit_forming: null, recent_units: 0 };
  it('quiet for an ordinary line', () => expect(abuseSignals([line])).toEqual([]));
  it('flags the per-order limit, habit forming, H1 / X / NDPS and repeat buying', () => {
    const s = abuseSignals([{ ...line, quantity: 10, habit_forming: true, drug_schedule: 'Schedule H1', recent_units: 20 }]).map((x) => x.signal);
    expect(s).toEqual([
      'Quantity 10 is at the limit per order (10)', 'Habit forming (medicine information)',
      'Schedule H1 medicine', 'Same buyer ordered 20 more in the last 30 days',
    ]);
  });
});
