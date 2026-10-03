-- ============================================================
-- Sprint 36 — merging catalogue list entries, partner stock-feed API keys,
-- and four-eyes approval of medicine information.
--   1. Category merge: an admin merges a duplicate category (e.g. two made with
--      Alt+C) into another. Its products move to the target in one transaction;
--      the source stays in the list switched off, pointing at the target
--      (merged_into), so a later file or form naming the old spelling lands in
--      the target instead of re-creating the duplicate. Audited (C-46).
--   2. HSN merge: the same for an HSN code entered by mistake — allowed only while
--      no product under it has been sold, because invoices and GST returns read
--      the product's HSN code (past tax documents must not change, C-30).
--   3. Partner API keys: a partner's billing software pushes its stock file to the
--      same import pipeline as the manual upload. Keys are stored only as a
--      SHA-256 hash with a short public prefix; scoped to "stock upload" for one
--      partner; revocable; every use audited (C-46). The partner's owner login
--      (vendor_users.is_owner) or an admin issues and revokes them.
--   4. Medicine information (Sprint 33) needs a SECOND pharmacist: the person who
--      wrote or submitted a version can never approve it (owner decision
--      2026-10-03; C-17, C-19, C-46). Existing approved text stays approved.
-- Re-runnable (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS / guarded backfills).
-- ============================================================

-- ── 1. Category merge ────────────────────────────────────────────────────────
ALTER TABLE product_categories
  ADD COLUMN IF NOT EXISTS merged_into UUID REFERENCES product_categories(id),
  ADD COLUMN IF NOT EXISTS merged_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS merged_by   UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE product_categories DROP CONSTRAINT IF EXISTS product_categories_merge_check;
-- A merged entry is switched off, never merged into itself
ALTER TABLE product_categories ADD CONSTRAINT product_categories_merge_check
  CHECK (merged_into IS NULL OR (merged_into <> id AND NOT is_active AND merged_at IS NOT NULL));

-- ── 2. HSN merge ─────────────────────────────────────────────────────────────
ALTER TABLE hsn_codes
  ADD COLUMN IF NOT EXISTS merged_into VARCHAR(8) REFERENCES hsn_codes(code) ON UPDATE CASCADE,
  ADD COLUMN IF NOT EXISTS merged_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS merged_by   UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE hsn_codes DROP CONSTRAINT IF EXISTS hsn_codes_merge_check;
ALTER TABLE hsn_codes ADD CONSTRAINT hsn_codes_merge_check
  CHECK (merged_into IS NULL OR (merged_into <> code AND NOT is_active AND merged_at IS NOT NULL));

-- The products ↔ lists trigger (Sprint 31, 34) now follows a merged entry to its
-- target: a product given the old spelling / code gets the target's. Everything
-- else is as in migration 29 (a switched-off entry is refused for a new choice).
CREATE OR REPLACE FUNCTION dawabag_catalogue_lists() RETURNS trigger AS $$
DECLARE
  k TEXT;
  found TEXT;
  active BOOLEAN;
  target UUID;
  hsn_target TEXT;
  renaming BOOLEAN := coalesce(current_setting('dawabag.catalogue_list_rename', true), '') = 'on';
BEGIN
  IF NEW.category IS NOT NULL AND length(btrim(NEW.category)) >= 2 THEN
    k := lower(regexp_replace(btrim(NEW.category), '\s+', ' ', 'g'));
    SELECT name, is_active, merged_into INTO found, active, target FROM product_categories WHERE name_key = k;
    IF found IS NULL THEN
      INSERT INTO product_categories (name) VALUES (left(regexp_replace(btrim(NEW.category), '\s+', ' ', 'g'), 100))
      ON CONFLICT (name_key) DO NOTHING;
      SELECT name, is_active, merged_into INTO found, active, target FROM product_categories WHERE name_key = k;
    END IF;
    IF target IS NOT NULL THEN
      -- merged (Sprint 36): the target's spelling; one hop only (merge re-points chains)
      SELECT name, is_active, name_key INTO found, active, k FROM product_categories WHERE id = target;
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
    SELECT merged_into INTO hsn_target FROM hsn_codes WHERE code = NEW.hsn_code;
    IF hsn_target IS NOT NULL THEN NEW.hsn_code := hsn_target; END IF;
    SELECT is_active INTO active FROM hsn_codes WHERE code = NEW.hsn_code;
    IF NOT active AND (TG_OP = 'INSERT' OR OLD.hsn_code IS NULL OR btrim(OLD.hsn_code) <> NEW.hsn_code) THEN
      RAISE EXCEPTION 'HSN code % is switched off in Catalogue lists', NEW.hsn_code
        USING ERRCODE = 'check_violation', CONSTRAINT = 'products_hsn_switched_off';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3. Partner API keys (stock feed) ─────────────────────────────────────────
-- The owner login of a partner: the first login linked to it (backfill), and the
-- first one linked from now on (trigger). Only the owner (or an admin) manages keys.
ALTER TABLE vendor_users ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE vendor_users vu SET is_owner = TRUE
WHERE NOT EXISTS (SELECT 1 FROM vendor_users o WHERE o.vendor_id = vu.vendor_id AND o.is_owner)
  AND (vu.user_id, vu.vendor_id) = (
    SELECT f.user_id, f.vendor_id FROM vendor_users f WHERE f.vendor_id = vu.vendor_id ORDER BY f.created_at, f.user_id LIMIT 1);

CREATE OR REPLACE FUNCTION dawabag_vendor_first_owner() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vendor_users WHERE vendor_id = NEW.vendor_id AND is_owner) THEN
    NEW.is_owner := TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS vendor_users_first_owner ON vendor_users;
CREATE TRIGGER vendor_users_first_owner BEFORE INSERT ON vendor_users
  FOR EACH ROW EXECUTE FUNCTION dawabag_vendor_first_owner();

CREATE TABLE IF NOT EXISTS partner_api_keys (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id     UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  -- public part of the key (shown in lists, used to find the row); the secret is never stored
  prefix         VARCHAR(16) NOT NULL UNIQUE CHECK (prefix ~ '^[a-z0-9]{8,16}$'),
  key_sha256     CHAR(64) NOT NULL CHECK (key_sha256 ~ '^[0-9a-f]{64}$'),
  label          VARCHAR(80) NOT NULL CHECK (length(btrim(label)) >= 2),
  scope          VARCHAR(30) NOT NULL DEFAULT 'stock_upload' CHECK (scope IN ('stock_upload')),
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at   TIMESTAMPTZ,
  use_count      INTEGER NOT NULL DEFAULT 0,
  revoked_at     TIMESTAMPTZ,
  revoked_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  revoke_reason  VARCHAR(300)
);
CREATE INDEX IF NOT EXISTS idx_partner_api_keys_partner ON partner_api_keys(partner_id, created_at DESC);

-- Which key sent an import (NULL = uploaded by a person in the portal)
ALTER TABLE partner_stock_imports ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES partner_api_keys(id) ON DELETE SET NULL;

-- ── 4. Medicine information: four eyes ───────────────────────────────────────
-- Everyone who wrote words of a version or sent it for review. The approver must
-- not be one of them. Versions approved before Sprint 36 by their own writer stay
-- approved (owner: existing published content counts as approved) and are marked.
ALTER TABLE product_info_versions
  ADD COLUMN IF NOT EXISTS author_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS approved_before_four_eyes BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE product_info_versions
   SET author_ids = ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[created_by, updated_by, submitted_by]) AS x WHERE x IS NOT NULL)
 WHERE author_ids = '{}';
UPDATE product_info_versions SET approved_before_four_eyes = TRUE
 WHERE status IN ('approved', 'superseded') AND reviewed_by IS NOT NULL AND reviewed_by = ANY(author_ids)
   AND NOT approved_before_four_eyes;
ALTER TABLE product_info_versions DROP CONSTRAINT IF EXISTS product_info_four_eyes;
ALTER TABLE product_info_versions ADD CONSTRAINT product_info_four_eyes
  CHECK (status NOT IN ('approved', 'superseded') OR approved_before_four_eyes
         OR reviewed_by IS NULL OR NOT (reviewed_by = ANY(author_ids)));
