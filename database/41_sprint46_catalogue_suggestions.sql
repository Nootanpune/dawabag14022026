-- ─────────────────────────────────────────────────────────────────────────────
-- 41_sprint46_catalogue_suggestions.sql — Sprint 46
-- Applied by the migration runner (backend/src/db/migrate.ts) as the database owner.
-- Safe to re-run (IF NOT EXISTS, trigger and constraints re-created).
--
-- Catalogue suggestions for DRAFT products (owner request 2026-10-04): a partner's
-- stock file names hundreds of products Dawabag does not list yet. An admin turns the
-- partner's requests into draft products (Sprint 29); suggested details for those
-- drafts (generic name, strength, dosage form, schedule, cold chain, product class,
-- new-drug flag, category, HSN, GST) are prepared outside Dawabag and imported from an
-- .xlsx for ONE partner. A suggestion is only ever SHOWN to the pharmacist on the
-- "New products to complete" form ("Suggested — check against the pack"): it is never
-- written into the product's decided fields. Only what the pharmacist saves and
-- approves is decided (C-10, C-19, C-25). Live products are never touched.
--
--   One row per (draft, import): immutable. A later import adds a new row while the
--   draft is still open; the newest row is the suggestion shown. Who imported it, the
--   file, the drafter's confidence and note are kept with it (C-46).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalogue_draft_suggestions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID NOT NULL REFERENCES catalogue_drafts(product_id) ON DELETE CASCADE,
  partner_id   UUID REFERENCES vendors(id) ON DELETE SET NULL,   -- the partner whose item the row matched
  import_id    UUID NOT NULL,                                     -- one per uploaded file
  row_number   INTEGER NOT NULL,
  item_name    VARCHAR(500) NOT NULL,                             -- the partner's item as the file names it
  pack         VARCHAR(100),
  company      VARCHAR(255),
  -- the suggested values (keys: generic_name, strength, dosage_form, drug_schedule, cold_chain,
  -- product_class, is_new_drug, category, hsn_code, gst_rate); a blank cell is left out
  suggested    JSONB NOT NULL,
  -- notes for the pharmacist, e.g. a category or HSN code not in the managed lists yet
  flags        JSONB NOT NULL DEFAULT '[]',
  confidence   VARCHAR(6) NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  note         TEXT,
  file_name    VARCHAR(255),
  file_sha256  CHAR(64),
  imported_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  imported_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT catalogue_suggestion_is_object CHECK (jsonb_typeof(suggested) = 'object'),
  CONSTRAINT catalogue_suggestion_flags_array CHECK (jsonb_typeof(flags) = 'array')
);

COMMENT ON TABLE catalogue_draft_suggestions IS
  'Sprint 46: suggested details for a DRAFT product imported for one partner; shown to the pharmacist, never written into the product (C-10, C-19). Immutable; newest row per product is current.';

-- The current suggestion of a draft (newest first)
CREATE INDEX IF NOT EXISTS idx_catalogue_suggestions_product ON catalogue_draft_suggestions(product_id, imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalogue_suggestions_import ON catalogue_draft_suggestions(import_id);

-- Immutable: a suggestion is what one import said. Only the references to a deleted
-- partner or user may be cleared (ON DELETE SET NULL).
CREATE OR REPLACE FUNCTION catalogue_suggestion_immutable() RETURNS trigger AS $$
BEGIN
  IF (to_jsonb(NEW) - 'partner_id' - 'imported_by') = (to_jsonb(OLD) - 'partner_id' - 'imported_by')
     AND (NEW.partner_id IS NULL OR NEW.partner_id = OLD.partner_id)
     AND (NEW.imported_by IS NULL OR NEW.imported_by = OLD.imported_by) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Catalogue suggestions cannot be changed; import a new one';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_catalogue_suggestion_immutable ON catalogue_draft_suggestions;
CREATE TRIGGER trg_catalogue_suggestion_immutable BEFORE UPDATE ON catalogue_draft_suggestions
  FOR EACH ROW EXECUTE FUNCTION catalogue_suggestion_immutable();

-- ── Privileges (Sprint 41: the API is a login in dawabag_app only) ───────────
-- The API only adds and reads suggestions; removal happens with the draft (cascade).
GRANT SELECT, INSERT ON catalogue_draft_suggestions TO dawabag_app;
GRANT SELECT, INSERT, DELETE ON catalogue_draft_suggestions TO dawabag_maintenance;
