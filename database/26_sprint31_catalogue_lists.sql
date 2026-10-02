-- ============================================================
-- Sprint 31 — managed lists for product categories and HSN codes, and the
-- "Non-scheduled" drug schedule.
--   Before: products.category and products.hsn_code were free text; the
--   pick-lists were "whatever live products already use". Now the lists are
--   kept on the server: admins and pharmacists add to them (Alt+C / "+ New" in
--   "New products to complete" and the product form), every addition audited
--   (C-46). products.category / hsn_code still hold the chosen value (the shop
--   filters by category name), always spelled as in the list.
--   Rows written by other paths (catalogue import, demo seed) register their
--   category / HSN in the list automatically (trigger below), so the list
--   always covers the catalogue.
-- Re-runnable (IF NOT EXISTS / DROP ... IF EXISTS / ON CONFLICT).
-- ============================================================

-- ── 1. Non-scheduled ─────────────────────────────────────────────────────────
-- A product in no Drugs & Cosmetics Rules schedule: no prescription needed, may
-- be sold online (C-08, C-10). Distinct from 'OTC'. Not put in teleconsultation
-- List O automatically (only OTC is, C-23): a pharmacist classifies it.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_drug_schedule_check;
ALTER TABLE products ADD CONSTRAINT products_drug_schedule_check
  CHECK (drug_schedule IN ('OTC', 'Non-scheduled', 'Schedule G', 'Schedule H', 'Schedule H1', 'Schedule X', 'NDPS'));

-- ── 2. Product categories ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL CHECK (length(btrim(name)) >= 2),
  -- one entry per name whatever the capitals or spaces ("Pain relief" = "pain  RELIEF")
  name_key    VARCHAR(100) GENERATED ALWAYS AS (lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))) STORED,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,   -- NULL = taken from the catalogue
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_categories_key ON product_categories(name_key);

-- Every category the catalogue already uses (first spelling seen wins)
INSERT INTO product_categories (name)
SELECT DISTINCT ON (lower(regexp_replace(btrim(category), '\s+', ' ', 'g'))) regexp_replace(btrim(category), '\s+', ' ', 'g')
FROM products
WHERE category IS NOT NULL AND length(btrim(category)) >= 2
ORDER BY lower(regexp_replace(btrim(category), '\s+', ' ', 'g')), category
ON CONFLICT (name_key) DO NOTHING;

-- ── 3. HSN codes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hsn_codes (
  code        VARCHAR(8) PRIMARY KEY CHECK (code ~ '^([0-9]{4}|[0-9]{6}|[0-9]{8})$'),
  description VARCHAR(200),             -- short words, e.g. 'Medicaments in measured doses'
  gst_rate    INTEGER CHECK (gst_rate IS NULL OR gst_rate IN (0, 5, 12, 18, 28)),   -- usual rate; a hint only
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every valid HSN code the catalogue already uses, with its most common GST rate
INSERT INTO hsn_codes (code, gst_rate)
SELECT btrim(hsn_code), mode() WITHIN GROUP (ORDER BY gst_rate)
FROM products
WHERE hsn_code ~ '^\s*([0-9]{4}|[0-9]{6}|[0-9]{8})\s*$'
GROUP BY btrim(hsn_code)
ON CONFLICT (code) DO NOTHING;
UPDATE hsn_codes SET gst_rate = NULL WHERE gst_rate IS NOT NULL AND gst_rate NOT IN (0, 5, 12, 18, 28);

-- ── 4. Keep products and the lists in step ───────────────────────────────────
-- A product's category is spelled as in the list; a new one (import, seed) is
-- added. A valid HSN code not in the list is added too. The API checks the list
-- first and audits additions; this is the safety net for every other path.
CREATE OR REPLACE FUNCTION dawabag_catalogue_lists() RETURNS trigger AS $$
DECLARE
  k TEXT;
  found TEXT;
BEGIN
  IF NEW.category IS NOT NULL AND length(btrim(NEW.category)) >= 2 THEN
    k := lower(regexp_replace(btrim(NEW.category), '\s+', ' ', 'g'));
    SELECT name INTO found FROM product_categories WHERE name_key = k;
    IF found IS NULL THEN
      INSERT INTO product_categories (name) VALUES (left(regexp_replace(btrim(NEW.category), '\s+', ' ', 'g'), 100))
      ON CONFLICT (name_key) DO NOTHING;
      SELECT name INTO found FROM product_categories WHERE name_key = k;
    END IF;
    NEW.category := found;
  END IF;
  IF NEW.hsn_code IS NOT NULL AND btrim(NEW.hsn_code) ~ '^([0-9]{4}|[0-9]{6}|[0-9]{8})$' THEN
    NEW.hsn_code := btrim(NEW.hsn_code);
    INSERT INTO hsn_codes (code, gst_rate)
    VALUES (NEW.hsn_code, CASE WHEN NEW.gst_rate IN (0, 5, 12, 18, 28) THEN NEW.gst_rate END)
    ON CONFLICT (code) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- Named to fire before products_search_vector_update (triggers fire by name)
DROP TRIGGER IF EXISTS products_catalogue_lists ON products;
CREATE TRIGGER products_catalogue_lists BEFORE INSERT OR UPDATE OF category, hsn_code ON products
  FOR EACH ROW EXECUTE FUNCTION dawabag_catalogue_lists();
