-- ─────────────────────────────────────────────────────────────────────────────
-- 44_sprint49_launch_readiness.sql — Sprint 49
-- Applied by the migration runner (backend/src/db/migrate.ts) as the database owner.
-- Safe to re-run (IF NOT EXISTS; functions and triggers re-created; seed rows are
-- inserted once and never overwrite what an admin has recorded).
--
-- Admin → Launch readiness: a live version of docs/LAUNCH_CHECKLIST.md. Most items are
-- computed by the API from the database and the server's configuration (presence of a
-- secret only, never its value — C-41, C-44). The jobs the software cannot see (a lawyer's
-- or CA's confirmation, DLT registration, a restore drill, the external penetration test…)
-- are kept here: one row per item, status + note, changed only by an admin through the
-- API, each change written to the audit log in the same transaction (C-46).
--
-- Backups: deploy/staging/backup/backup.sh records each run as a job_runs row named
-- 'db_backup' (no schema change); the readiness page reads the newest one.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS launch_checklist_items (
  item_key    VARCHAR(20) PRIMARY KEY,               -- the checklist number, e.g. '1.2', '4.1-restore'
  section     SMALLINT NOT NULL CHECK (section BETWEEN 1 AND 8),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT NOT NULL,
  who         VARCHAR(120) NOT NULL,
  link_href   VARCHAR(200),                          -- where in Dawabag the job is done, if anywhere
  link_label  VARCHAR(120),
  status      VARCHAR(16) NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'done', 'not_applicable')),
  note        TEXT CHECK (note IS NULL OR length(note) <= 1000),
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE launch_checklist_items IS
  'Sprint 49: launch-checklist jobs the software cannot compute (lawyer, CA, DLT, restore drill…). Status + note changed only by an admin through the API, audited (C-46).';

-- Only status, note and who/when changed it may change outside a maintenance session; rows
-- are never deleted by the API (an item that no longer applies is marked not_applicable).
CREATE OR REPLACE FUNCTION dawabag_launch_item_guard() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Launch checklist items are not deleted; mark the item "not applicable" instead' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.item_key IS DISTINCT FROM OLD.item_key OR NEW.section IS DISTINCT FROM OLD.section
     OR NEW.sort_order IS DISTINCT FROM OLD.sort_order OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.who IS DISTINCT FROM OLD.who OR NEW.link_href IS DISTINCT FROM OLD.link_href
     OR NEW.link_label IS DISTINCT FROM OLD.link_label OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only the status and note of a launch checklist item can be changed' USING ERRCODE = 'check_violation';
  END IF;
  -- ON DELETE SET NULL of the person who last changed it (nothing else changes)
  IF NEW.updated_by IS NULL AND OLD.updated_by IS NOT NULL AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.note IS NOT DISTINCT FROM OLD.note AND NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    RETURN NEW;
  END IF;
  IF NEW.updated_by IS NULL OR NEW.updated_at IS NULL THEN
    RAISE EXCEPTION 'A change to a launch checklist item must name who made it and when' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS launch_checklist_items_guard ON launch_checklist_items;
CREATE TRIGGER launch_checklist_items_guard BEFORE UPDATE OR DELETE ON launch_checklist_items
  FOR EACH ROW EXECUTE FUNCTION dawabag_launch_item_guard();

-- Seed: the manual items of docs/LAUNCH_CHECKLIST.md as they stood on 4 October 2026.
-- No business data: titles and notes describe jobs, not licences, numbers or people.
INSERT INTO launch_checklist_items (item_key, section, sort_order, title, who, link_href, link_label, status, note) VALUES
  ('1.1', 1, 10, 'Company details, drug licences, pharmacist-in-charge and grievance officer entered in Settings; every licence in Licences (RUNBOOK §8 item 1)',
     'Owner', '/admin/licences', 'Admin → Licences', 'not_started', 'Needs the real licence copies'),
  ('1.2', 1, 20, 'Lawyer confirms the licence form numbers the software uses: 20 / 21 retail, 20B / 21B wholesale, and the reading of 20C / 20D / 20F / 20G / 25B',
     'Lawyer', NULL, NULL, 'not_started', 'Pending lawyer'),
  ('1.3', 1, 30, 'Lawyer confirms the Schedule C / C1 reading (Form 21 / 21B needed for insulin, vaccines etc.)',
     'Lawyer', NULL, NULL, 'not_started', 'Pending lawyer'),
  ('1.4', 1, 40, 'Written orders from doctors: an in-app signed requisition counts as the signed written order (r.65(9)(b))',
     'Owner', NULL, NULL, 'done', 'Decided — confirmed by the owner 4 Oct 2026 (upload stays available)'),
  ('1.5', 1, 50, 'Lawyer and CA sign off the compliance rulebook (C-01..C-46) and the Sprint 5 defaults (return windows, delivery code) (RUNBOOK §8 item 6)',
     'Lawyer, CA', NULL, NULL, 'not_started', 'Pending'),
  ('1.6', 1, 60, 'Decide which products are "doctors and hospitals only" or "licensed trade only" — a pharmacist then sets each one (RUNBOOK §7k)',
     'Owner, pharmacist', '/staff/online-sale', 'Online-sale status (Who may buy)', 'not_started', 'Control built; nothing restricted yet (owner to decide)'),
  ('2.2', 2, 20, 'Test payment and refund, and a prescription order showing "held" then "charged" after the pharmacist''s check (RUNBOOK §7f, §8 item 5)',
     'Owner', NULL, NULL, 'not_started', 'Pending owner UAT — only a stand-in gateway tested so far'),
  ('2.3', 2, 30, 'CA confirms GST invoice details, credit notes and the GST reports (invoice issued at the pharmacist''s approval) (RUNBOOK §7h)',
     'CA', NULL, NULL, 'not_started', 'Pending'),
  ('2.4', 2, 40, 'E-invoice (IRP) sandbox test with the GST portal credentials (RUNBOOK §2)',
     'Owner, CA', '/admin/einvoices', 'Admin → E-invoices', 'not_started', NULL),
  ('3.1-dlt', 3, 15, 'DLT sender id and templates registered with the operators for: sign-in code, dispatched, out for delivery, delivered, order cancelled, return update (RUNBOOK §2 "SMS (MSG91, DLT)")',
     'Owner', '/admin/settings', 'Admin → Settings (SMS templates)', 'in_progress', 'Mostly registered earlier; owner to send the details for checking / redoing'),
  ('3.2', 3, 20, 'WhatsApp number and approved templates, only if WhatsApp will be used (RUNBOOK §2 "WhatsApp", §8 item 8)',
     'Owner', NULL, NULL, 'not_started', 'Optional'),
  ('3.3', 3, 30, 'Email (Amazon SES) moved out of sandbox (RUNBOOK §8 item 5)',
     'Owner, Developer', NULL, NULL, 'not_started', NULL),
  ('4.1-restore', 4, 15, 'Restore drill done on the production backups (RUNBOOK §6 "Restore drill", §7c)',
     'Developer, Owner', NULL, NULL, 'not_started', 'Only the trial server exists'),
  ('4.7', 4, 70, 'Android release signing key kept by the owner; app built for release (RUNBOOK §7b)',
     'Owner, Developer', NULL, NULL, 'not_started', 'Pending owner'),
  ('4.8', 4, 80, 'Stock feed from partner Nootan''s billing software: Allied will not provide an export or API, so Dawabag / Nootan automate their own export (docs/medivision-export-automation.md) and the stock connector uploads it (docs/stock-connector.md)',
     'Owner, Developer', '/admin/stock-feeds', 'Admin → Live stock feeds', 'in_progress', 'Own solution: Power Automate Desktop export + stock connector (Allied declined, 4 Oct 2026)'),
  ('5.3', 5, 30, 'Schedule C / C1 marked on every product it applies to (never guessed from the name) — a pharmacist confirms the catalogue is complete',
     'Pharmacist', '/admin/products', 'Admin → Products', 'not_started', 'Pending'),
  ('6.4', 6, 40, 'Rider logins, if Dawabag delivers itself (RUNBOOK §8 item 8)',
     'Owner', NULL, NULL, 'not_started', 'Only if Dawabag delivers itself'),
  ('7.2', 7, 20, 'An unpaid "pay the difference" after an order change does not time out',
     'Owner', NULL, NULL, 'done', 'Decided — confirmed 4 Oct 2026'),
  ('8.1', 8, 10, 'Owner''s walk-through on the trial server: buyer, doctor, partner, pharmacist and admin journeys (RUNBOOK §7e)',
     'Owner', NULL, NULL, 'in_progress', 'Ongoing'),
  ('8.2', 8, 20, 'Real-money test order end to end: pay, pharmacist approves (invoice issued), pack, dispatch, deliver, return / refund (RUNBOOK §7f, §7h)',
     'Owner', NULL, NULL, 'not_started', 'After the payment, SMS and Razorpay items'),
  ('8.3', 8, 30, 'Security: an external penetration test before launch (internal reviews in docs/security/)',
     'Developer, external tester', NULL, NULL, 'in_progress', 'Internal reviews done up to Sprint 47; external test pending'),
  ('8.4', 8, 40, 'Automated tests green on the release (backend, website, browser tests) (RUNBOOK §7a)',
     'Developer', NULL, NULL, 'done', 'Green on 4 Oct 2026 (Sprint 48) — run again on the release build')
ON CONFLICT (item_key) DO NOTHING;

-- The API (dawabag_app) reads and updates rows; DELETE is refused by the trigger above.
GRANT SELECT, UPDATE ON launch_checklist_items TO dawabag_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON launch_checklist_items TO dawabag_maintenance;
