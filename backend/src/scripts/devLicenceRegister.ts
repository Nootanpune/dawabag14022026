// src/scripts/devLicenceRegister.ts — development / CI machines only (scripts/dev-up.sh).
// Since Sprint 32 Dawabag's own stock is offered only to buyers its licence register
// allows (retail: Form 20/21; trade: Form 20B/21B, C-07). A fresh development database
// has an empty register, so nothing of Dawabag's would sell in the smoke and browser
// tests. This adds placeholder rows — clearly marked, not real licences — only for a
// kind of sale the register does not cover yet. Refuses to run in production.
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const ROWS: [type: string, kind: 'retail' | 'trade', number: string][] = [
  ['retail_20', 'retail', 'DEV-ONLY-NOT-A-LICENCE-20'],
  ['retail_21', 'retail', 'DEV-ONLY-NOT-A-LICENCE-21'],
  ['wholesale_20b', 'trade', 'DEV-ONLY-NOT-A-LICENCE-20B'],
  ['wholesale_21b', 'trade', 'DEV-ONLY-NOT-A-LICENCE-21B'],
];
const TYPES = { retail: ['retail_20', 'retail_21'], trade: ['wholesale_20b', 'wholesale_21b'] };

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Development helper: never run it against production');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    for (const kind of ['retail', 'trade'] as const) {
      const covered = (await c.query(
        `SELECT 1 FROM business_licences WHERE is_active AND licence_type = ANY($1) AND (valid_upto IS NULL OR valid_upto >= CURRENT_DATE) LIMIT 1`,
        [TYPES[kind]])).rows[0];
      if (covered) continue;
      for (const [type, k, number] of ROWS.filter((r) => r[1] === kind)) {
        await c.query(
          `INSERT INTO business_licences (licence_type, licence_number, valid_upto, renewal_owner, notes)
           VALUES ($1, $2, CURRENT_DATE + 3650, 'Development machine', 'Placeholder for local / CI tests only — not a real licence')
           ON CONFLICT (licence_type, licence_number) DO UPDATE SET is_active = TRUE, valid_upto = EXCLUDED.valid_upto`, [type, number]);
        console.log(`Development licence register: added placeholder ${type} (${k})`);
      }
    }
  } finally { await c.end(); }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
