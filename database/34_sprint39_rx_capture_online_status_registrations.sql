-- ─────────────────────────────────────────────────────────────────────────────
-- 34_sprint39_rx_capture_online_status_registrations.sql — Sprint 39
-- Applied by the migration runner (backend/src/db/migrate.ts). Safe to re-run.
--
--  1. Prescription orders: the card / UPI payment is AUTHORISED at checkout and
--     captured only after the pharmacist check passes; a refused or timed-out order
--     has its authorisation released, never charged (owner 2026-10-03; C-08, C-37)
--  2. Online-sale status per product (permitted / restricted / prohibited) with a
--     dated notification reference and an append-only log; new products start
--     restricted; Schedule X / NDPS can never be permitted (owner 2026-10-03; C-10)
--  3. Pharmacist registration validity for Dawabag's and partners' pharmacists
--     (state council, number, valid till, status, verified by / at) (C-03, C-08)
--  4. Partner batch provenance: supplier, supplier licence and purchase invoice per
--     partner batch, immutable once recorded (owner 2026-10-03; C-02, C-05, C-28)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Authorise-then-capture for prescription orders ────────────────────────
-- 'released' = an authorisation Dawabag decided not to capture. Razorpay has no void
-- call: an authorised payment that is never captured goes back to the buyer when the
-- order's manual-capture window ends (capture_options.manual_expiry_period). The buyer
-- is never charged.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded', 'released'));

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS capture_mode         VARCHAR(10) NOT NULL DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS authorised_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gateway_expires_at   TIMESTAMPTZ,     -- when the gateway gives the hold back by itself
  ADD COLUMN IF NOT EXISTS release_due_at       TIMESTAMPTZ,     -- Dawabag releases it here if still unchecked
  ADD COLUMN IF NOT EXISTS captured_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS released_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_reason       TEXT,
  ADD COLUMN IF NOT EXISTS hold_alerted_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS capture_attempts     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capture_failure      TEXT;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_capture_mode_check;
ALTER TABLE payments ADD CONSTRAINT payments_capture_mode_check CHECK (capture_mode IN ('automatic', 'manual'));
-- A captured or released hold says when
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_hold_times_check;
ALTER TABLE payments ADD CONSTRAINT payments_hold_times_check CHECK (
  (status <> 'released' OR released_at IS NOT NULL) AND (capture_mode <> 'manual' OR status NOT IN ('authorized') OR authorised_at IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_payments_held ON payments (release_due_at) WHERE status = 'authorized' AND capture_mode = 'manual';

INSERT INTO app_settings (key, value, description) VALUES
  ('payments.rx_authorisation', '{"alert_after_hours": 48, "release_after_hours": 72, "gateway_expiry_minutes": 7200}',
   'Prescription orders are authorised at checkout and captured after the pharmacist check. Staff are alerted after alert_after_hours; '
   'an order still unchecked after release_after_hours is cancelled and its hold released (never charged). gateway_expiry_minutes is sent '
   'to Razorpay as the manual-capture window (max 7200 = 5 days) and must stay longer than release_after_hours.')
ON CONFLICT (key) DO NOTHING;

-- ── 2. Online-sale status per product ────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products'
                 AND column_name = 'online_sale_status') THEN
    ALTER TABLE products
      ADD COLUMN online_sale_status VARCHAR(12),
      ADD COLUMN online_sale_ref    VARCHAR(200),
      ADD COLUMN online_sale_ref_date DATE,
      ADD COLUMN online_sale_reason TEXT,
      ADD COLUMN online_sale_set_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN online_sale_set_at TIMESTAMPTZ;
    -- Backfill (owner 2026-10-03): products already in the catalogue keep selling
    -- ('permitted'); Schedule X / NDPS and not-listed ones are 'prohibited'; drafts and
    -- removed ones start 'restricted' like any new product.
    UPDATE products SET
      online_sale_status = CASE
        WHEN drug_schedule IN ('Schedule X', 'NDPS') OR catalogue_state = 'not_listed' THEN 'prohibited'
        WHEN catalogue_state = 'live' AND deleted_at IS NULL THEN 'permitted'
        ELSE 'restricted' END,
      online_sale_reason = 'Set when online-sale status was introduced (Sprint 39): products already in the catalogue stay on sale; '
                           || 'Schedule X / NDPS are never sold online',
      online_sale_set_at = NOW();
    ALTER TABLE products ALTER COLUMN online_sale_status SET DEFAULT 'restricted';
    ALTER TABLE products ALTER COLUMN online_sale_status SET NOT NULL;
  END IF;
END $$;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_online_sale_status_check;
ALTER TABLE products ADD CONSTRAINT products_online_sale_status_check
  CHECK (online_sale_status IN ('permitted', 'restricted', 'prohibited'));
-- C-10: Schedule X and NDPS can never be allowed for online sale, whoever writes the row
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_x_ndps_never_permitted;
ALTER TABLE products ADD CONSTRAINT products_x_ndps_never_permitted
  CHECK (NOT (online_sale_status = 'permitted' AND drug_schedule IN ('Schedule X', 'NDPS')));
CREATE INDEX IF NOT EXISTS idx_products_online_sale ON products (online_sale_status) WHERE deleted_at IS NULL;

-- Append-only history of every status change (C-46)
CREATE TABLE IF NOT EXISTS product_online_status_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  old_status      VARCHAR(12),
  new_status      VARCHAR(12) NOT NULL,
  notification_ref VARCHAR(200),
  notification_date DATE,
  reason          TEXT,
  set_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  set_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  drug_schedule   VARCHAR(20)
);
CREATE INDEX IF NOT EXISTS idx_online_status_log_product ON product_online_status_log (product_id, set_at DESC);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM product_online_status_log) THEN
    INSERT INTO product_online_status_log (product_id, old_status, new_status, reason, set_at, drug_schedule)
    SELECT id, NULL, online_sale_status, online_sale_reason, COALESCE(online_sale_set_at, NOW()), drug_schedule FROM products;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION dawabag_online_status_log_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION 'The online-sale status log is append-only (C-46)' USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_online_status_log_final ON product_online_status_log;
CREATE TRIGGER trg_online_status_log_final BEFORE UPDATE OR DELETE ON product_online_status_log
  FOR EACH ROW EXECUTE FUNCTION dawabag_online_status_log_final();

-- A product moved to Schedule X / NDPS stops being permitted at once (fail closed, C-10);
-- setting 'permitted' on such a product directly is refused by the CHECK above.
CREATE OR REPLACE FUNCTION dawabag_online_status_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.drug_schedule IS DISTINCT FROM OLD.drug_schedule
     AND NEW.drug_schedule IN ('Schedule X', 'NDPS') AND NEW.online_sale_status = 'permitted'
     AND OLD.online_sale_status = 'permitted' THEN
    NEW.online_sale_status := 'prohibited';
    NEW.online_sale_reason := 'Schedule changed to ' || NEW.drug_schedule || ': never sold online (C-10)';
    NEW.online_sale_ref := NULL;
    NEW.online_sale_ref_date := NULL;
    NEW.online_sale_set_at := NOW();
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_online_status_guard ON products;
CREATE TRIGGER trg_online_status_guard BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION dawabag_online_status_guard();

-- Every change is logged by the database itself, whoever made it
CREATE OR REPLACE FUNCTION dawabag_online_status_log_change() RETURNS trigger AS $$
BEGIN
  IF NEW.online_sale_status IS DISTINCT FROM OLD.online_sale_status
     OR NEW.online_sale_ref IS DISTINCT FROM OLD.online_sale_ref
     OR NEW.online_sale_reason IS DISTINCT FROM OLD.online_sale_reason THEN
    INSERT INTO product_online_status_log (product_id, old_status, new_status, notification_ref, notification_date, reason, set_by, set_at, drug_schedule)
    VALUES (NEW.id, OLD.online_sale_status, NEW.online_sale_status, NEW.online_sale_ref, NEW.online_sale_ref_date,
            NEW.online_sale_reason, NEW.online_sale_set_by, COALESCE(NEW.online_sale_set_at, NOW()), NEW.drug_schedule);
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_online_status_log_change ON products;
CREATE TRIGGER trg_online_status_log_change AFTER UPDATE OF online_sale_status, online_sale_ref, online_sale_reason, drug_schedule ON products
  FOR EACH ROW EXECUTE FUNCTION dawabag_online_status_log_change();

-- ── 3. Pharmacist registration validity ─────────────────────────────────────
-- Dawabag's pharmacists (users with role pharmacist_rx): one row each.
CREATE TABLE IF NOT EXISTS pharmacist_registrations (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state_council     VARCHAR(120),
  registration_no   VARCHAR(50) NOT NULL,
  valid_till        DATE,
  status            VARCHAR(12) NOT NULL DEFAULT 'active',
  status_note       TEXT,
  verified_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at       TIMESTAMPTZ,
  -- TRUE only for pharmacists who were already working before Sprint 39: allowed to
  -- go on (with a warning to complete the record) until an admin records the details
  recorded_before_sprint39 BOOLEAN NOT NULL DEFAULT FALSE,
  last_alert_days   INTEGER,
  updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pharmacist_registrations_status_check CHECK (status IN ('active', 'lapsed', 'suspended')),
  -- Verified means the council, number and validity were checked and recorded
  CONSTRAINT pharmacist_registrations_verified_check CHECK (verified_at IS NULL OR (state_council IS NOT NULL AND valid_till IS NOT NULL))
);

INSERT INTO pharmacist_registrations (user_id, registration_no, status, recorded_before_sprint39, status_note)
SELECT u.id, u.pharmacist_reg_no, 'active', TRUE,
       'Working before Sprint 39: council, validity and verification to be recorded by an admin'
FROM users u
WHERE u.role = 'pharmacist_rx' AND u.pharmacist_reg_no IS NOT NULL AND u.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM pharmacist_registrations r WHERE r.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'pharmacist_registration.backfilled');
INSERT INTO app_settings (key, value, description) VALUES
  ('pharmacist_registration.backfilled', 'true', 'Sprint 39: pharmacists working before registration validity was recorded were carried over once')
ON CONFLICT (key) DO NOTHING;

-- Partners' pharmacists (Sprint 28 vendor_pharmacists): the same details
ALTER TABLE vendor_pharmacists
  ADD COLUMN IF NOT EXISTS state_council     VARCHAR(120),
  ADD COLUMN IF NOT EXISTS valid_till        DATE,
  ADD COLUMN IF NOT EXISTS registration_status VARCHAR(12) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_note       TEXT,
  ADD COLUMN IF NOT EXISTS verified_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recorded_before_sprint39 BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_alert_days   INTEGER;
ALTER TABLE vendor_pharmacists DROP CONSTRAINT IF EXISTS vendor_pharmacists_registration_status_check;
ALTER TABLE vendor_pharmacists ADD CONSTRAINT vendor_pharmacists_registration_status_check
  CHECK (registration_status IN ('active', 'lapsed', 'suspended'));
ALTER TABLE vendor_pharmacists DROP CONSTRAINT IF EXISTS vendor_pharmacists_verified_check;
ALTER TABLE vendor_pharmacists ADD CONSTRAINT vendor_pharmacists_verified_check
  CHECK (verified_at IS NULL OR (state_council IS NOT NULL AND valid_till IS NOT NULL));
UPDATE vendor_pharmacists SET recorded_before_sprint39 = TRUE,
       status_note = 'Added before Sprint 39: council, validity and verification to be recorded by an admin'
WHERE verified_at IS NULL AND NOT recorded_before_sprint39
  AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'pharmacist_registration.partner_backfilled');
INSERT INTO app_settings (key, value, description) VALUES
  ('pharmacist_registration.partner_backfilled', 'true', 'Sprint 39: partner pharmacists added before registration validity was recorded were carried over once')
ON CONFLICT (key) DO NOTHING;

-- ── 4. Partner batch provenance ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_batch_provenance (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_inventory_id  UUID NOT NULL UNIQUE REFERENCES partner_inventory(id) ON DELETE CASCADE,
  partner_id            UUID NOT NULL REFERENCES vendors(id),
  supplier_name         VARCHAR(255),
  supplier_licence_no   VARCHAR(100),
  supplier_invoice_no   VARCHAR(100),
  supplier_invoice_date DATE,
  source                VARCHAR(12) NOT NULL,
  import_id             UUID,
  recorded_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_batch_provenance_source_check CHECK (source IN ('file', 'feed', 'portal')),
  CONSTRAINT partner_batch_provenance_some_detail CHECK (
    COALESCE(supplier_name, supplier_licence_no, supplier_invoice_no) IS NOT NULL OR supplier_invoice_date IS NOT NULL),
  CONSTRAINT partner_batch_provenance_invoice_date_check CHECK (supplier_invoice_date IS NULL OR supplier_invoice_date <= CURRENT_DATE + 1)
);
CREATE INDEX IF NOT EXISTS idx_partner_provenance_partner ON partner_batch_provenance (partner_id);

-- Immutable once recorded (C-34): no update, no delete outside maintenance
CREATE OR REPLACE FUNCTION dawabag_provenance_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION 'Batch supplier details are kept as first recorded and cannot be changed (C-34)' USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_provenance_final ON partner_batch_provenance;
CREATE TRIGGER trg_provenance_final BEFORE UPDATE OR DELETE ON partner_batch_provenance
  FOR EACH ROW EXECUTE FUNCTION dawabag_provenance_final();

INSERT INTO app_settings (key, value, description) VALUES
  ('partner_stock.provenance_required', 'false',
   'When true, partner batches of Schedule H1 and cold-chain products need the supplier name, purchase invoice number and date '
   '(stock file, portal or live feed) before they are offered. Owner 2026-10-03: optional at first.')
ON CONFLICT (key) DO NOTHING;

-- ── Privileges: the API role and the maintenance role (migration 33 default
-- privileges cover new tables; granted again here so the order of runs never matters)
GRANT SELECT, INSERT, UPDATE, DELETE ON product_online_status_log, pharmacist_registrations, partner_batch_provenance
  TO dawabag_app, dawabag_maintenance;
