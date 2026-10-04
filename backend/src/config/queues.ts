// Where the API's background job queues (notifications, e-invoices; Bull on Redis) live.
//
// A Bull queue is named only by its Redis keys ("<prefix>:notifications:…"). Every API
// process connected to the same Redis with the same prefix takes jobs from the same
// queue — which is right for replicas of ONE deployment (any of them may send), and wrong
// for two different stacks that happen to share a Redis server: a job queued by one is
// sent by the other with ITS provider settings and database. Found in Sprint 47 behind the
// Sprint 8 smoke flake "buyer told the parcel is out for delivery" (delivery row 'failed',
// "fetch failed"): a second API on the same Redis (another test stack, with its fake
// providers elsewhere) took the out-for-delivery job. The same could send a trial's
// messages through a staging server's settings, or lose them (user not in that database).
//
// QUEUE_PREFIX names the deployment's queues. Unset → Bull's own 'bull' (unchanged for
// existing servers, so jobs already waiting are not orphaned). scripts/dev-env.sh gives
// each local stack its own prefix (per API port) and test-spawned APIs get their own.
const PREFIX_RE = /^[A-Za-z0-9_:.-]{1,64}$/;
export const DEFAULT_QUEUE_PREFIX = 'bull';

/** The Redis key prefix for this deployment's job queues (validated; default 'bull'). */
export function queuePrefix(env: NodeJS.ProcessEnv = process.env): string {
  const v = String(env.QUEUE_PREFIX ?? '').trim();
  return v ? v : DEFAULT_QUEUE_PREFIX;
}

/** Start-up check (config/env.ts): a prefix with other characters is refused. */
export function queuePrefixProblem(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = String(env.QUEUE_PREFIX ?? '').trim();
  return v && !PREFIX_RE.test(v) ? 'QUEUE_PREFIX may only contain letters, digits, _ : . - (at most 64)' : null;
}

/** Options shared by every Bull queue of the API. */
export function queueOptions(env: NodeJS.ProcessEnv = process.env) {
  return { prefix: queuePrefix(env), redis: env.REDIS_URL || 'redis://localhost:6379' };
}
