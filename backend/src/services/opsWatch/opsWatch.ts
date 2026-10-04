// Sprint 50 — the hourly operations watch (job `ops_watch`). It reads the same facts as
// Admin → Launch readiness (services/launchReadiness/facts.service.ts) and FAILS when the
// server's safety nets have stopped: the newest database backup is older than 26 hours or its
// last attempt failed (deploy/staging/backup/backup.sh notes each run as job_runs 'db_backup'),
// or the nightly record-integrity check (job chain_verify) has not run for 48 hours.
//
// A failed run is the alert: the scheduler tells every admin once (email and push, job_failed)
// and not again until the watch has succeeded once (jobs/scheduler.ts alertFirstFailure) — no
// new alert channel, no outside service (docs/PRODUCTION.md "Monitoring"). A broken chain is
// alerted by chain_verify itself at once (chain_break), so it is not repeated here.
// C-34 (books kept 8 years need working backups), C-43 (incident detection), C-46.
import { BACKUP_MAX_AGE_HOURS, CHAIN_CHECK_MAX_AGE_HOURS } from '../launchReadiness/computed';
import { readinessFacts } from '../launchReadiness/facts.service';
import { ReadinessFacts } from '../launchReadiness/types';

const HOUR = 3600_000;

export type OpsFacts = Pick<ReadinessFacts, 'now' | 'app_env' | 'backup' | 'chain'>;

/**
 * What is wrong now, in plain words (empty = all well). Pure: `uptimeHours` is how long this API
 * process has run, so a freshly started production server is not alarmed about a backup or a
 * nightly check that could not have happened yet.
 */
export function opsProblems(f: OpsFacts, uptimeHours: number): string[] {
  const problems: string[] = [];
  const now = Date.parse(f.now);
  const age = (iso: string | null) => (iso ? (now - Date.parse(iso)) / HOUR : Infinity);
  const production = f.app_env === 'production';

  // Backups: expected on production, and anywhere a backup has ever been noted (a trial)
  const { last_ok_at: ok, last_failed_at: failed } = f.backup;
  if (production || ok || failed) {
    if (failed && (!ok || Date.parse(failed) > Date.parse(ok))) {
      problems.push(`The last database backup attempt FAILED (${failed}); see the backup service's log (RUNBOOK §7c)`);
    } else if (ok && age(ok) > BACKUP_MAX_AGE_HOURS) {
      problems.push(`The newest database backup is ${Math.round(age(ok))} hours old (more than ${BACKUP_MAX_AGE_HOURS}); is the backup service running? (RUNBOOK §7c)`);
    } else if (!ok && !failed && uptimeHours > BACKUP_MAX_AGE_HOURS) {
      problems.push(`No database backup has been recorded on this production server (RUNBOOK §7c)`);
    }
  }

  // The nightly record-integrity check (chain_verify, 02:20 IST)
  const checked = f.chain.last_checked_at;
  if (checked && age(checked) > CHAIN_CHECK_MAX_AGE_HOURS) {
    problems.push(`The record-integrity check last ran ${Math.round(age(checked))} hours ago (more than ${CHAIN_CHECK_MAX_AGE_HOURS}); check Admin → Jobs → chain_verify (RUNBOOK §6)`);
  } else if (!checked && production && uptimeHours > CHAIN_CHECK_MAX_AGE_HOURS) {
    problems.push('The record-integrity check has never run on this production server; check Admin → Jobs → chain_verify (RUNBOOK §6)');
  }
  return problems;
}

/** The job: throws (→ one job_failed alert to every admin) when anything is wrong. */
export async function runOpsWatch(uptimeHours = process.uptime() / 3600) {
  const facts = await readinessFacts();
  const problems = opsProblems(facts, uptimeHours);
  if (problems.length) throw new Error(problems.join(' | '));
  return { ok: true, backup_last_ok_at: facts.backup.last_ok_at, chain_last_checked_at: facts.chain.last_checked_at };
}
