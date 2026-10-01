-- ─────────────────────────────────────────────────────────────────────────────
-- 21_sprint23_search_trigram.sql — Sprint 23: product search that forgives typos
-- Applied by the migration runner. Safe to re-run.
--
-- Buyers type brand names, generic (salt) names, partial words and misspellings
-- ("paracetmol", "pantop", "amoxycillin"). pg_trgm gives trigram word similarity;
-- GIN trigram indexes on lower(name) and lower(generic_name) serve both the
-- substring (LIKE '%word%') and the similarity (`word <% column`) conditions of
-- services/search/productSearchSql.ts. The other text columns stay out: marketer
-- words are still found by the existing full-text vector, and composition is long
-- free text that would make the index large for little gain.
-- fastupdate = off: the catalogue changes rarely and is searched constantly; with
-- the default, rows added since the last vacuum sit in an unsorted pending list that
-- every search scans (a 15k-product import made each search ~10× slower until vacuum).
--
-- A managed database may not let this role create extensions: then the migration
-- only warns and the API searches without typo matching (substring + full text).
-- If an administrator enables pg_trgm later, run the two CREATE INDEX statements
-- below by hand (RUNBOOK 7d); the API notices the extension within 5 minutes.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN insufficient_privilege OR undefined_file OR feature_not_supported THEN
  RAISE WARNING 'pg_trgm could not be installed (%); product search will work without typo matching', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING GIN (lower(name) gin_trgm_ops)
      WITH (fastupdate = off);
    CREATE INDEX IF NOT EXISTS idx_products_generic_trgm ON products USING GIN (lower(generic_name) gin_trgm_ops)
      WITH (fastupdate = off);
  ELSE
    RAISE WARNING 'pg_trgm is not installed; trigram indexes on products not created';
  END IF;
END $$;
