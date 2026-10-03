-- ─────────────────────────────────────────────────────────────────────────────
-- 40_sprint45_imported_info_drafts.sql — Sprint 45
-- Applied by the migration runner (backend/src/db/migrate.ts) as the database owner.
-- Safe to re-run (IF NOT EXISTS, constraints re-created).
--
-- Imported medicine-information drafts (owner request 2026-10-03): medicine information
-- for ONE partner's products (e.g. Nootan) is written outside Dawabag and imported from
-- an .xlsx as DRAFT versions (never pending review, never approved). A registered
-- pharmacist then checks every line against the pack insert, edits and sends it; a
-- SECOND registered pharmacist approves (Sprint 36 four eyes, C-19). Buyers see nothing
-- until then. The importer is NOT an author: an imported version starts with
-- author_ids = '{}', so the first pharmacist who edits or sends it becomes its author
-- and cannot approve it (product_info_four_eyes, unchanged).
--
--   source            'editor' (written in Dawabag's editor) | 'imported_draft'
--   import_partner_id the partner whose item the row was matched through (queue filter)
--   import_meta       what the drafter said about the text: assumed composition,
--                     composition confidence (high | medium | low), drafting note, the
--                     partner's item name / pack / company, who imported it and when.
--                     Shown to the pharmacist as a banner in the editor; never to buyers.
-- No new table: the columns are covered by the existing grants to dawabag_app.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE product_info_versions
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'editor',
  ADD COLUMN IF NOT EXISTS import_partner_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS import_meta JSONB;

ALTER TABLE product_info_versions DROP CONSTRAINT IF EXISTS product_info_versions_source_check;
ALTER TABLE product_info_versions ADD CONSTRAINT product_info_versions_source_check
  CHECK (source IN ('editor', 'imported_draft'));

-- An imported version always carries what the drafter said about it
ALTER TABLE product_info_versions DROP CONSTRAINT IF EXISTS product_info_imported_meta;
ALTER TABLE product_info_versions ADD CONSTRAINT product_info_imported_meta
  CHECK (source <> 'imported_draft' OR (import_meta IS NOT NULL
         AND import_meta->>'composition_confidence' IN ('high', 'medium', 'low')));

COMMENT ON COLUMN product_info_versions.source IS
  'Sprint 45: editor = written in Dawabag''s editor; imported_draft = written outside Dawabag and imported as a draft for a pharmacist to check (C-19)';
COMMENT ON COLUMN product_info_versions.import_meta IS
  'Sprint 45: assumed_composition, composition_confidence, drafting_note, item_name, pack, company, imported_by, imported_at (staff only, never shown to buyers)';

-- "Imported drafts to check": drafts by partner
CREATE INDEX IF NOT EXISTS idx_product_info_imported_open ON product_info_versions(import_partner_id, created_at)
  WHERE source = 'imported_draft' AND status IN ('draft', 'pending_review');
