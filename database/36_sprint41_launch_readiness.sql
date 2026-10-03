-- Sprint 41 — launch readiness (re-runnable).
--   1. Approved cold-chain couriers (gap analysis §5.1 #17, URS-105; C-25): a refrigerated
--      parcel is dispatched only with a courier on this list (names separated by commas).
--      NULL = not enforced yet; the admin dashboard warns until it is set.
--   2. Nobody but the owner creates objects in the schema (PostgreSQL 15+ default, made
--      explicit for databases created earlier). The API's own login (member of dawabag_app
--      only) is created by the migration runner from DB_APP_LOGIN / DB_APP_PASSWORD
--      (src/db/appLogin.ts), not here: a password never belongs in a migration file.

-- ── 1. Approved cold-chain couriers ─────────────────────────────────────────
INSERT INTO app_settings (key, value, description) VALUES
  ('delivery.cold_chain_couriers', 'null',
   'Approved cold-chain couriers for refrigerated (2–8 °C) parcels, names separated by commas (e.g. "Blue Dart Cold Chain, Dawabag rider"). Empty = any courier (not enforced). URS-105; C-25')
ON CONFLICT (key) DO NOTHING;

-- ── 2. No object creation in public by anyone but the owner ─────────────────
DO $$ BEGIN
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Not the owner of schema public: CREATE stays as it is (PostgreSQL 15+ already denies it to PUBLIC)';
END $$;
