import { cleanup, db } from './data';

export default async function globalTeardown() {
  const c = db();
  await c.connect();
  try { await cleanup(c); } finally { await c.end(); }
}
