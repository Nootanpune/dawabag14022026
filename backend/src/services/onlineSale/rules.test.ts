import { mayAllow, mayStop, notOnlineMessage, onlineSellableSql, scheduleProblem, statusInputProblems } from './rules';

const today = '2026-10-03';
describe('online-sale status rules (Sprint 39, C-10)', () => {
  it('only a pharmacist allows; pharmacists and admins stop', () => {
    expect(mayAllow('pharmacist_rx')).toBe(true);
    expect(mayAllow('admin')).toBe(false);
    expect(mayAllow('super_admin')).toBe(false);
    expect(mayStop('admin')).toBe(true);
    expect(mayStop('pharmacist_pack')).toBe(false);
  });

  it('allowing needs a dated, past reference', () => {
    expect(statusInputProblems({ status: 'permitted', notification_ref: 'GSR 1', notification_date: today }, 'pharmacist_rx', today)).toEqual([]);
    expect(statusInputProblems({ status: 'permitted' }, 'pharmacist_rx', today).join()).toMatch(/reference/);
    expect(statusInputProblems({ status: 'permitted', notification_ref: 'GSR 1', notification_date: '2026-10-04' }, 'pharmacist_rx', today).join()).toMatch(/future/);
    expect(statusInputProblems({ status: 'permitted', notification_ref: 'GSR 1', notification_date: today }, 'admin', today).join()).toMatch(/pharmacist/);
  });

  it('stopping needs a reason', () => {
    expect(statusInputProblems({ status: 'restricted', reason: 'Gazette ban' }, 'admin', today)).toEqual([]);
    expect(statusInputProblems({ status: 'prohibited' }, 'admin', today).join()).toMatch(/why/);
  });

  it('Schedule X and NDPS can never be permitted', () => {
    expect(scheduleProblem('permitted', 'Schedule X', 'A')).toMatch(/never be sold online/);
    expect(scheduleProblem('permitted', 'NDPS', 'A')).toMatch(/never/);
    expect(scheduleProblem('prohibited', 'NDPS', 'A')).toBeNull();
    expect(scheduleProblem('permitted', 'Schedule H1', 'A')).toBeNull();
  });

  it('one buyer-side condition, and plain words', () => {
    expect(onlineSellableSql('p')).toBe("p.online_sale_status = 'permitted'");
    expect(notOnlineMessage('X', 'prohibited')).toMatch(/cannot be sold online/);
    expect(notOnlineMessage('X', 'restricted')).toMatch(/not available for online sale/);
  });
});
