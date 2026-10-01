-- ─────────────────────────────────────────────────────────────────────────────
-- 19_sprint20_ist.sql — Sprint 20: India Standard Time for every session
-- Applied by the migration runner. Safe to re-run.
--
-- Dawabag operates only in India: business days, report periods, "today" and the
-- financial year are Indian. The API already sets Asia/Kolkata on its own
-- connections; this makes it the database default too, so reports, admin tools and
-- scripts that connect directly see the same days. Timestamps are still stored as
-- absolute instants (timestamptz); only how days are cut changes.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Kolkata');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Could not set the database time zone (not the owner); the API sets Asia/Kolkata per connection';
END $$;
