// src/scripts/demoSeed.ts — demo data for the owner's TRIAL server only
// (deploy/trial/TRIAL.md). Refuses unless APP_ENV=trial and DEMO_SEED=true
// (scripts/demo/guard.ts), so it can never run against staging or production.
// Safe to re-run: everything is upserted by SKU, mobile number or licence number.
//
//   On the trial server (the deploy workflow does this when "seed demo" is ticked):
//     docker compose … exec -e DEMO_SEED=true api node dist/scripts/demoSeed.js
//     docker compose … exec -e DEMO_SEED=true api node dist/scripts/demoSeed.js --remove
//   Locally:  APP_ENV=trial DEMO_SEED=true TRIAL_DEMO_PASSWORD=… npx ts-node --transpile-only src/scripts/demoSeed.ts
//
// Creates Nashik PIN codes and premises, placeholder legal details marked DEMO
// (C-04, C-36), ~40 generic medicines with stock and drawn pack shots (C-17, C-19,
// C-27), and one login per role sharing TRIAL_DEMO_PASSWORD (never printed).
// DEMO_PACK_IMAGES=false skips the pack shots.
import '../config/timezone';
import 'dotenv/config';
import { connectDB, pool, withTransaction } from '../config/database';
import { connectRedis, getRedis } from '../config/redis';
import { demoSeedRefusal, parseMode } from './demo/guard';
import { DEMO_PEOPLE, seedCustomerAddress, upsertPeople } from './demo/people';
import { seedPlaces } from './demo/places';
import { seedCatalogue } from './demo/catalogue';
import { seedDoctor, seedPartner } from './demo/practice';
import { removeDemoData } from './demo/remove';

const say = (s: string) => process.stdout.write(`${s}\n`);

async function seed() {
  const password = process.env.TRIAL_DEMO_PASSWORD!;
  const ids = await withTransaction(async (c) => {
    const people = await upsertPeople(c, password);
    const places = await seedPlaces(c, people.admin);
    await seedCustomerAddress(c, people.customer);
    say(`  ✓ ${DEMO_PEOPLE.length} demo logins, ${places.pincodes} Nashik PIN codes, premises and DEMO legal details`);
    return people;
  });
  const cat = await seedCatalogue(ids.admin, ids.pharmacist_rx, { images: process.env.DEMO_PACK_IMAGES !== 'false' });
  say(`  ✓ ${cat.products} demo medicines with stock; ${cat.reviewed} copies approved by the demo pharmacist; ${cat.photos} new pack shots`
    + (cat.imagesSkipped ? ' (pack shots skipped: no object store configured)' : ''));
  const doc = await seedDoctor(ids.admin, DEMO_PEOPLE.find((p) => p.key === 'doctor')!.mobile);
  say(`  ✓ demo doctor verified, ${doc.slotsAdded} new open slots over the next 3 days (fee ₹300)`);
  const partner = await withTransaction((c) => seedPartner(c, ids.admin, ids.partner));
  say(`  ✓ demo partner pharmacy approved with ${partner.listings} live listings and stock`);

  say('\nDemo logins (password: the TRIAL_DEMO_PASSWORD you set — not shown here):\n');
  const rows = DEMO_PEOPLE.map((p) => [p.mobile, p.role, p.name, p.what]);
  const head = ['Mobile', 'Role', 'Name', 'Try'];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r: string[]) => r.map((x, i) => x.padEnd(w[i])).join('  ');
  say(line(head)); say(w.map((n) => '-'.repeat(n)).join('  '));
  for (const r of rows) say(line(r));
  say('\nSign in on the website or the app with the mobile number and that password. Demo delivery PIN codes: 422001–422011 (Nashik).');
}

async function main() {
  const mode = parseMode(process.argv.slice(2));
  const refusal = demoSeedRefusal(process.env, mode);
  if (refusal) { process.stderr.write(`${refusal}\n`); process.exit(2); }
  await connectDB();
  await connectRedis();
  try {
    if (mode === 'remove') {
      const r = await removeDemoData();
      say(`Demo data removed: ${r.users} logins, ${r.products} products, ${r.partners} partner, ${r.settingsReset} legal settings reset to empty.`);
    } else {
      say('Seeding the trial demo data…');
      await seed();
    }
  } finally {
    await pool.end();
    getRedis().disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(`Demo seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
