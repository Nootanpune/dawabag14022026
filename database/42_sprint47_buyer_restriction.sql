-- ─────────────────────────────────────────────────────────────────────────────
-- 42_sprint47_buyer_restriction.sql — Sprint 47
-- Applied by the migration runner (backend/src/db/migrate.ts) as the database owner.
-- Safe to re-run (IF NOT EXISTS; functions, triggers and constraints re-created).
--
-- Who may buy a product (owner request 2026-10-04). Some products are for hospital use
-- only (e.g. thrombolytics, neonatal lung surfactants, chemotherapy and monoclonal
-- antibody injections, intravesical BCG, labour-induction pessaries, intravitreal
-- injections) or are supplied only under a controlled supply programme. The owner has
-- not yet decided which products get which restriction, so this builds the CONTROL and
-- applies it to no product: every existing and new product is 'everyone' (unchanged).
--
--   everyone           — any buyer, subject to every other rule (default)
--   practitioners_only — only doctors / medical institutions whose registration Dawabag
--                        verified and is in date (Sprint 44; Drugs Rules 1945 r.65(9)(b));
--                        the signed written order is still needed on every order
--   trade_only         — licensed trade buyers (retailers / wholesalers whose drug
--                        licences are checked and in date, Sprint 30 / 32; C-14, C-33)
--                        and verified doctors / institutions
--
-- Set only by a Dawabag pharmacist with a valid registration (Sprint 39 gate), always
-- with a reason; every change is kept in an append-only log (C-46). The API enforces it
-- on every buyer path (search label, product page, cart, order placement, lines added
-- before the invoice, refills); this file keeps the record honest.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'products' AND column_name = 'buyer_restriction') THEN
    ALTER TABLE products
      ADD COLUMN buyer_restriction        VARCHAR(20) NOT NULL DEFAULT 'everyone',
      ADD COLUMN buyer_restriction_reason TEXT,
      ADD COLUMN buyer_restriction_set_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN buyer_restriction_set_at TIMESTAMPTZ;
  END IF;
END $$;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_buyer_restriction_check;
ALTER TABLE products ADD CONSTRAINT products_buyer_restriction_check
  CHECK (buyer_restriction IN ('everyone', 'practitioners_only', 'trade_only'));
CREATE INDEX IF NOT EXISTS idx_products_buyer_restriction ON products (buyer_restriction)
  WHERE deleted_at IS NULL AND buyer_restriction <> 'everyone';

COMMENT ON COLUMN products.buyer_restriction IS
  'Sprint 47: who may buy — everyone | practitioners_only (verified doctors / institutions, r.65(9)(b)) | trade_only (licensed retailers / wholesalers and verified practitioners). Set by a registered pharmacist with a reason; log in product_buyer_restriction_log (C-46).';

-- ── Append-only history of every change (C-46) ──────────────────────────────
CREATE TABLE IF NOT EXISTS product_buyer_restriction_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  old_restriction  VARCHAR(20),
  new_restriction  VARCHAR(20) NOT NULL,
  reason           TEXT NOT NULL,
  set_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  set_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_buyer_restriction_log_product ON product_buyer_restriction_log (product_id, set_at DESC);

COMMENT ON TABLE product_buyer_restriction_log IS
  'Sprint 47: every change of products.buyer_restriction with who, when and why. Append-only (C-46); written by trigger.';

-- Only the clearing of a deleted user's reference (ON DELETE SET NULL) and the product's
-- own removal (cascade, maintenance only) may touch a row.
CREATE OR REPLACE FUNCTION dawabag_buyer_restriction_log_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'set_by') = (to_jsonb(OLD) - 'set_by') AND NEW.set_by IS NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'The buyer-restriction log is append-only (C-46)' USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_buyer_restriction_log_final ON product_buyer_restriction_log;
CREATE TRIGGER trg_buyer_restriction_log_final BEFORE UPDATE OR DELETE ON product_buyer_restriction_log
  FOR EACH ROW EXECUTE FUNCTION dawabag_buyer_restriction_log_final();

-- A change of who may buy must say who made it and why (fail closed, C-46); the API
-- (services/buyerRestriction) checks the same and that the person is a registered pharmacist.
CREATE OR REPLACE FUNCTION dawabag_buyer_restriction_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.buyer_restriction IS DISTINCT FROM OLD.buyer_restriction AND NOT dawabag_maintenance_active() THEN
    IF NEW.buyer_restriction_set_by IS NULL
       OR NEW.buyer_restriction_reason IS NULL OR length(btrim(NEW.buyer_restriction_reason)) < 5
       OR NEW.buyer_restriction_reason IS NOT DISTINCT FROM OLD.buyer_restriction_reason THEN
      RAISE EXCEPTION 'Who may buy a product is changed only by a pharmacist, with a reason (C-46)' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_buyer_restriction_guard ON products;
CREATE TRIGGER trg_buyer_restriction_guard BEFORE UPDATE OF buyer_restriction ON products
  FOR EACH ROW EXECUTE FUNCTION dawabag_buyer_restriction_guard();

CREATE OR REPLACE FUNCTION dawabag_buyer_restriction_log_change() RETURNS trigger AS $$
BEGIN
  IF NEW.buyer_restriction IS DISTINCT FROM OLD.buyer_restriction
     OR NEW.buyer_restriction_reason IS DISTINCT FROM OLD.buyer_restriction_reason THEN
    INSERT INTO product_buyer_restriction_log (product_id, old_restriction, new_restriction, reason, set_by, set_at)
    VALUES (NEW.id, OLD.buyer_restriction, NEW.buyer_restriction,
            COALESCE(NULLIF(btrim(NEW.buyer_restriction_reason), ''), '(no reason recorded)'),
            NEW.buyer_restriction_set_by, COALESCE(NEW.buyer_restriction_set_at, NOW()));
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_buyer_restriction_log_change ON products;
CREATE TRIGGER trg_buyer_restriction_log_change AFTER UPDATE OF buyer_restriction, buyer_restriction_reason ON products
  FOR EACH ROW EXECUTE FUNCTION dawabag_buyer_restriction_log_change();

-- ── Privileges (Sprint 41: the API is a login in dawabag_app only) ───────────
-- The API reads and adds log rows (through the trigger, which runs as the caller). It never
-- changes or removes them: the trigger above refuses that for every login but the
-- maintenance role (the API login's table grants are re-applied by db/appLogin.ts).
GRANT SELECT, INSERT ON product_buyer_restriction_log TO dawabag_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_buyer_restriction_log TO dawabag_maintenance;
