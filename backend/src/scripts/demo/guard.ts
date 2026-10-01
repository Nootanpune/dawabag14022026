// src/scripts/demo/guard.ts — when the demo seed may run. Demo data (placeholder
// licences, demo medicines, one shared password for every role) belongs only on
// the owner's trial server (deploy/trial/TRIAL.md), never on staging or production:
// the seed refuses unless APP_ENV=trial AND DEMO_SEED=true, and a production
// environment that is not a trial is refused whatever else is set (C-04, C-41).

export type DemoMode = 'seed' | 'remove';

const WEAK = /^(password|passw0rd|12345678|change[-_ ]?me|demo|trial|dawabag)/i;

/** Why the seed must not run here, or null when it may. */
export function demoSeedRefusal(env: NodeJS.ProcessEnv, mode: DemoMode = 'seed'): string | null {
  if (env.APP_ENV !== 'trial') {
    return `Refused: the demo seed runs only on a trial server (APP_ENV=trial; here APP_ENV=${env.APP_ENV || 'unset'})`;
  }
  if (env.DEMO_SEED !== 'true') return 'Refused: set DEMO_SEED=true for this run to confirm demo data is wanted';
  if (mode === 'remove') return null;
  const pw = env.TRIAL_DEMO_PASSWORD ?? '';
  if (pw.length < 10) return 'Refused: TRIAL_DEMO_PASSWORD must be set, at least 10 characters (one password for every demo login)';
  if (WEAK.test(pw)) return 'Refused: TRIAL_DEMO_PASSWORD is too easy to guess; generate one (deploy/trial/make-trial-env.sh does)';
  return null;
}

export function parseMode(argv: string[]): DemoMode {
  const extra = argv.filter((a) => a !== '--remove');
  if (extra.length) throw new Error(`Unknown argument(s): ${extra.join(' ')} (usage: demoSeed [--remove])`);
  return argv.includes('--remove') ? 'remove' : 'seed';
}
