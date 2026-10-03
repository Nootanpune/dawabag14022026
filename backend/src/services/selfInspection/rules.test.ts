import { actionChangeProblem, inspectionProblems, isOverdue, itemKey, nextDueDate, templateProblems } from './rules';

const items = [{ key: 'temps', label: 'Storage temperatures' }, { key: 'pests', label: 'Pest control' }];
const action = { description: 'Service the fridge', owner_user_id: '00000000-0000-0000-0000-000000000001', due_date: '2026-10-20' };

describe('self-inspection rules (Sprint 40, O15, C-34)', () => {
  it('item keys and checklist checks', () => {
    expect(itemKey('Storage temperatures (2–8 °C)')).toBe('storage_temperatures_2_8_c');
    expect(templateProblems({ name: 'Monthly', frequency: 'monthly', items })).toEqual([]);
    expect(templateProblems({ name: 'x', frequency: 'daily', items: [] })).toHaveLength(3);
    expect(templateProblems({ name: 'Monthly', frequency: 'monthly', items: [items[0], items[0]] })[0]).toMatch(/twice/);
  });
  it('the next due date follows the frequency', () => {
    expect(nextDueDate(null, '2026-10-03', 'monthly')).toBe('2026-11-03');
    expect(nextDueDate('2026-10-01', '2026-01-01', 'weekly')).toBe('2026-10-08');
    expect(nextDueDate('2026-10-01', '2026-01-01', 'quarterly')).toBe('2027-01-01');
    expect(nextDueDate('2026-10-01', '2026-01-01', 'annual')).toBe('2027-10-01');
  });
  it('every item answered; a non-conformity needs a corrective action', () => {
    const today = '2026-10-03';
    expect(inspectionProblems(items, [{ item_key: 'temps', result: 'ok' }], today)).toEqual(['Answer "Pest control"']);
    expect(inspectionProblems(items, [{ item_key: 'temps', result: 'ok' }, { item_key: 'pests', result: 'non_conformity', note: 'No record for 2 months' }], today)[0])
      .toMatch(/needs a corrective action/);
    expect(inspectionProblems(items, [{ item_key: 'temps', result: 'observation' }, { item_key: 'pests', result: 'ok' }], today)[0]).toMatch(/say what was found/);
    expect(inspectionProblems(items, [{ item_key: 'temps', result: 'ok' }, { item_key: 'pests', result: 'non_conformity', note: 'No record', action: { ...action, due_date: '2026-10-01' } }], today)[0])
      .toMatch(/past/);
    expect(inspectionProblems(items, [{ item_key: 'temps', result: 'ok' }, { item_key: 'pests', result: 'non_conformity', note: 'No record', action }], today)).toEqual([]);
    expect(inspectionProblems(items, [{ item_key: 'temps', result: 'ok' }, { item_key: 'pests', result: 'ok' }, { item_key: 'other', result: 'ok' }], today)[0]).toMatch(/not on this checklist/);
  });
  it('corrective action status changes', () => {
    expect(actionChangeProblem('open', 'in_progress', null)).toBeNull();
    expect(actionChangeProblem('open', 'closed', '')).toMatch(/close-out/);
    expect(actionChangeProblem('in_progress', 'closed', 'Fridge serviced, certificate filed')).toBeNull();
    expect(actionChangeProblem('closed', 'open', 'x')).toMatch(/final/);
    expect(actionChangeProblem('open', 'open', null)).toMatch(/already open/);
    expect(isOverdue('2026-10-01', 'open', '2026-10-03')).toBe(true);
    expect(isOverdue('2026-10-01', 'closed', '2026-10-03')).toBe(false);
  });
});
