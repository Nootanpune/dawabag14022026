-- ─────────────────────────────────────────────────────────────────────────────
-- 45_sprint50_production_readiness_items.sql — Sprint 50 (production deployment kit)
-- Applied by the migration runner (backend/src/db/migrate.ts) as the database owner.
-- Safe to re-run: seed rows are inserted once (ON CONFLICT DO NOTHING) and never
-- overwrite what an admin has recorded. No schema change, no new grants.
--
-- Four manual items for Admin → Launch readiness (RUNBOOK §7l) covering the production
-- set-up in docs/PRODUCTION.md that the software cannot see from inside: the GitHub
-- "production" environment and its approval, DNS for the real domain with the existing
-- e-mail left working, offsite encrypted backups in a second Indian region (C-34, C-44), and
-- the outside uptime alert. Titles describe jobs only — no addresses, keys or business data.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO launch_checklist_items (item_key, section, sort_order, title, who, link_href, link_label, status, note) VALUES
  ('4.10', 4, 100, 'Production server prepared (deploy/production/bootstrap-server.sh), GitHub environment "production" with a required reviewer, PRODUCTION_ENV and the SSH secrets stored there, first deploy done (docs/PRODUCTION.md)',
     'Developer, Owner', NULL, NULL, 'not_started', 'Waiting for the hosting choice'),
  ('4.11', 4, 110, 'DNS at the registrar for the real domain: website, API and CAA records added; the existing e-mail (MX, SPF, DKIM) left untouched and tested after the change (docs/PRODUCTION.md "DNS")',
     'Owner', NULL, NULL, 'not_started', NULL),
  ('4.12', 4, 120, 'Offsite backups: a separate bucket in a second Indian region with retention rules, backup-only keys, client-side encryption on, and BACKUP_ENC_KEY kept in the owner''s password manager (docs/PRODUCTION.md "Backups")',
     'Developer, Owner', NULL, NULL, 'not_started', NULL),
  ('4.13', 4, 130, 'Alerts tested: the production monitor (GitHub Actions) opens an issue when the site is down, and admins received the ops_watch alert in a drill; optional outside uptime monitor (docs/PRODUCTION.md "Monitoring")',
     'Developer, Owner', '/admin/jobs', 'Admin → Jobs', 'not_started', NULL)
ON CONFLICT (item_key) DO NOTHING;
