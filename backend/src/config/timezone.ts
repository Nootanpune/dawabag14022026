// Imported first by src/index.ts. The API process runs in UTC whatever the host's
// zone: node-postgres turns DATE columns into local-midnight Date objects, and the
// code reads them back with toISOString() — under another zone (an IST server
// started with `npm start`) a prescription's valid_until, a refill date or a batch
// expiry would move one day earlier. People see IST through src/utils/ist.ts and
// database sessions run in Asia/Kolkata (config/database.ts). Dockerfile and
// scripts/dev-env.sh set TZ=UTC too; this makes it hold everywhere (C-08, C-27).
process.env.TZ = 'UTC';
