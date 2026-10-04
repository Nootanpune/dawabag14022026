-- ─────────────────────────────────────────────────────────────────────────────
-- 43_sprint48_session_revocation.sql — Sprint 48 (security review of Sprints 41–47, #9)
-- Applied by the migration runner (backend/src/db/migrate.ts) as the database owner.
-- Safe to re-run (IF NOT EXISTS).
--
-- When a super-admin resets a person's two-step sign-in (lost or stolen phone), the
-- sessions that person already had — possibly open on that very phone — must end too.
-- Every access and refresh token issued before users.sessions_revoked_at is refused
-- (the same check as a password change, Sprint 34). C-41, C-44, C-46.
-- No new grants: dawabag_app already reads and updates users.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_revoked_at TIMESTAMPTZ;

COMMENT ON COLUMN users.sessions_revoked_at IS
  'Sprint 48: tokens issued before this moment no longer open the account (set when a super-admin resets the person''s two-step sign-in)';
