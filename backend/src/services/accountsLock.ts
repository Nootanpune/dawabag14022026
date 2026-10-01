// GST period lock (CGST s.37/39; C-30, C-34). Once the CA has filed the returns for
// a period, the owner sets accounts.locked_until; no purchase-side document can
// then be dated on or before it, so filed figures never change underneath.
import { PoolClient } from 'pg';
import { AppError } from '../utils/AppError';
import { getSetting } from './settings.service';

export async function assertOpenPeriod(date: string, what: string, client?: PoolClient) {
  const locked = await getSetting<string | null>('accounts.locked_until', null, client);
  if (locked && date <= locked) {
    throw new AppError(`${what} dated ${date} falls in a closed GST period (locked until ${locked}); ask accounts`, 409);
  }
}
