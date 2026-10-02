-- ============================================================
-- Sprint 34 — Schedule C / C1 per product, retention of dose answers and
-- health profiles, and switched-off catalogue list entries.
-- Re-runnable (IF NOT EXISTS / CREATE OR REPLACE / jsonb merge keeping set values).
-- ============================================================

-- ── 1. Schedule C / C1 (Drugs Rules, 1945) ───────────────────────────────────
-- Biological and special products (sera, vaccines, insulin and the injectables
-- listed in Schedules C and C1). A seller needs Form 21 (retail) or 21B (trade) for
-- them and Form 20 / 20B for every other drug — services/stock/sellingRights.ts
-- reads this flag for search, product page, cart and allocation (C-07, C-33).
-- Set by the pharmacist (product form, "New products to complete", catalogue import
-- column "Schedule C/C1"); never guessed from the name. FALSE = not marked.
ALTER TABLE products ADD COLUMN IF NOT EXISTS schedule_c_c1 BOOLEAN NOT NULL DEFAULT FALSE;
COMMENT ON COLUMN products.schedule_c_c1 IS
  'Drugs Rules Schedule C / C1 product (set by the pharmacist): sold only under Form 21 / 21B; others under Form 20 / 20B (C-07, C-33)';

-- ── 2. Retention (C-44): Taken / Skipped answers and ended reminders ─────────
-- Added to the existing retention.days setting without changing values an admin set.
-- inactive_health_profiles is NOT added: a health profile is kept until the buyer
-- withdraws consent or asks for erasure, unless an admin sets that period.
UPDATE app_settings
   SET value = '{"reminder_dose_logs": 730, "ended_reminders": 730}'::jsonb || value
 WHERE key = 'retention.days';

-- ── 3. Switched-off categories and HSN codes (Sprint 32 gap) ─────────────────
-- The trigger that keeps products and the lists in step now refuses a product
-- being given a category or HSN code an admin has switched off. A product that
-- already had that entry keeps it (and may be saved again unchanged). A category
-- rename by an admin (catalogueLists/manage.service) moves products to the new
-- spelling of the SAME entry and sets dawabag.catalogue_list_rename for that.
CREATE OR REPLACE FUNCTION dawabag_catalogue_lists() RETURNS trigger AS $$
DECLARE
  k TEXT;
  found TEXT;
  active BOOLEAN;
  renaming BOOLEAN := coalesce(current_setting('dawabag.catalogue_list_rename', true), '') = 'on';
BEGIN
  IF NEW.category IS NOT NULL AND length(btrim(NEW.category)) >= 2 THEN
    k := lower(regexp_replace(btrim(NEW.category), '\s+', ' ', 'g'));
    SELECT name, is_active INTO found, active FROM product_categories WHERE name_key = k;
    IF found IS NULL THEN
      INSERT INTO product_categories (name) VALUES (left(regexp_replace(btrim(NEW.category), '\s+', ' ', 'g'), 100))
      ON CONFLICT (name_key) DO NOTHING;
      SELECT name, is_active INTO found, active FROM product_categories WHERE name_key = k;
    END IF;
    IF NOT active AND NOT renaming AND (TG_OP = 'INSERT' OR OLD.category IS NULL
        OR lower(regexp_replace(btrim(OLD.category), '\s+', ' ', 'g')) <> k) THEN
      RAISE EXCEPTION 'Category "%" is switched off in Catalogue lists', found
        USING ERRCODE = 'check_violation', CONSTRAINT = 'products_category_switched_off';
    END IF;
    NEW.category := found;
  END IF;
  IF NEW.hsn_code IS NOT NULL AND btrim(NEW.hsn_code) ~ '^([0-9]{4}|[0-9]{6}|[0-9]{8})$' THEN
    NEW.hsn_code := btrim(NEW.hsn_code);
    INSERT INTO hsn_codes (code, gst_rate)
    VALUES (NEW.hsn_code, CASE WHEN NEW.gst_rate IN (0, 5, 12, 18, 28) THEN NEW.gst_rate END)
    ON CONFLICT (code) DO NOTHING;
    SELECT is_active INTO active FROM hsn_codes WHERE code = NEW.hsn_code;
    IF NOT active AND (TG_OP = 'INSERT' OR OLD.hsn_code IS NULL OR btrim(OLD.hsn_code) <> NEW.hsn_code) THEN
      RAISE EXCEPTION 'HSN code % is switched off in Catalogue lists', NEW.hsn_code
        USING ERRCODE = 'check_violation', CONSTRAINT = 'products_hsn_switched_off';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
