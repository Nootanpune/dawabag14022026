// Whether the database has pg_trgm (migration 21 installs it when the role may).
// Without it the search still works: substring and full-text matching only, no
// typo forgiveness. The answer is re-checked every few minutes so enabling the
// extension later needs no restart; a query that fails because the extension
// vanished marks it unavailable at once (see productSearch.service.ts).
import { queryOne } from '../../config/database';
import { logger } from '../../config/logger';

const RECHECK_MS = 5 * 60 * 1000;
let known: { available: boolean; at: number } | null = null;

export async function trigramAvailable(): Promise<boolean> {
  if (known && Date.now() - known.at < RECHECK_MS) return known.available;
  try {
    const row = await queryOne<{ ok: boolean }>("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') AS ok");
    const available = !!row?.ok;
    if (!available && known?.available !== false) logger.warn('pg_trgm is not installed: product search runs without typo matching');
    known = { available, at: Date.now() };
  } catch (err) {
    logger.warn('Could not check for pg_trgm; product search runs without typo matching', err);
    known = { available: false, at: Date.now() };
  }
  return known.available;
}

export function markTrigramUnavailable(): void {
  if (known?.available !== false) logger.warn('pg_trgm disappeared: product search runs without typo matching');
  known = { available: false, at: Date.now() };
}

/** Postgres "undefined function/operator": the extension is gone. */
export const isMissingTrigramError = (err: unknown) => (err as { code?: string })?.code === '42883';
