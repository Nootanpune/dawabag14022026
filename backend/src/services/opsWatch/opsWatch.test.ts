// Sprint 50 — the hourly operations watch: backup age / failure and the nightly chain check
jest.mock('../launchReadiness/facts.service', () => ({ readinessFacts: jest.fn() }));
import { readinessFacts } from '../launchReadiness/facts.service';
import { OpsFacts, opsProblems, runOpsWatch } from './opsWatch';
import { findJob } from '../../jobs/registry';

const NOW = '2026-10-04T12:00:00.000Z';
const hoursAgo = (h: number) => new Date(Date.parse(NOW) - h * 3600_000).toISOString();
const facts = (over: Partial<OpsFacts> = {}): OpsFacts => ({
  now: NOW, app_env: 'production',
  backup: { last_ok_at: hoursAgo(5), last_failed_at: null },
  chain: { last_checked_at: hoursAgo(10), chains: 3, broken: 0, last_job_status: 'succeeded' },
  ...over,
});

describe('opsProblems', () => {
  it('is quiet when the newest backup is under 26 hours old and the chain check ran within 48 hours', () => {
    expect(opsProblems(facts(), 100)).toEqual([]);
  });

  it('reports a backup older than 26 hours, and a last attempt that failed', () => {
    expect(opsProblems(facts({ backup: { last_ok_at: hoursAgo(27), last_failed_at: null } }), 100).join(' ')).toMatch(/27 hours old/);
    const failed = opsProblems(facts({ backup: { last_ok_at: hoursAgo(25), last_failed_at: hoursAgo(1) } }), 100);
    expect(failed.join(' ')).toMatch(/attempt FAILED/);
    // An old failure followed by a good backup is fine
    expect(opsProblems(facts({ backup: { last_ok_at: hoursAgo(1), last_failed_at: hoursAgo(20) } }), 100)).toEqual([]);
  });

  it('on production, no backup at all is a problem once the server has run for more than 26 hours', () => {
    const none = facts({ backup: { last_ok_at: null, last_failed_at: null } });
    expect(opsProblems(none, 2)).toEqual([]);
    expect(opsProblems(none, 30).join(' ')).toMatch(/No database backup/);
    // Development / staging without backups: nothing expected, nothing reported
    expect(opsProblems({ ...none, app_env: 'development' }, 500)).toEqual([]);
    // A trial that has backups is watched too
    expect(opsProblems(facts({ app_env: 'trial', backup: { last_ok_at: hoursAgo(40), last_failed_at: null } }), 500).join(' ')).toMatch(/40 hours old/);
  });

  it('reports a chain check older than 48 hours, or never run on production after 48 hours', () => {
    expect(opsProblems(facts({ chain: { last_checked_at: hoursAgo(50), chains: 3, broken: 0, last_job_status: null } }), 100).join(' ')).toMatch(/50 hours ago/);
    const never = facts({ chain: { last_checked_at: null, chains: 0, broken: 0, last_job_status: null } });
    expect(opsProblems(never, 10)).toEqual([]);
    expect(opsProblems(never, 49).join(' ')).toMatch(/never run/);
    expect(opsProblems({ ...never, app_env: 'development' }, 500)).toEqual([]);
  });

  it('does not repeat a broken chain (chain_verify alerts that itself)', () => {
    expect(opsProblems(facts({ chain: { last_checked_at: hoursAgo(1), chains: 3, broken: 1, last_job_status: 'succeeded' } }), 100)).toEqual([]);
  });
});

describe('runOpsWatch (job ops_watch)', () => {
  const mocked = readinessFacts as jest.Mock;
  it('succeeds with a summary when all is well', async () => {
    mocked.mockResolvedValueOnce(facts());
    await expect(runOpsWatch(100)).resolves.toMatchObject({ ok: true });
  });
  it('throws every problem in one message, so the scheduler alerts admins once', async () => {
    mocked.mockResolvedValueOnce(facts({ backup: { last_ok_at: hoursAgo(30), last_failed_at: null },
      chain: { last_checked_at: hoursAgo(60), chains: 1, broken: 0, last_job_status: null } }));
    await expect(runOpsWatch(100)).rejects.toThrow(/30 hours old.*\|.*60 hours ago/);
  });
  it('is registered hourly', () => {
    expect(findJob('ops_watch')?.cron).toBe('40 * * * *');
  });
});
