-- ─────────────────────────────────────────────────────────────────────────────
-- 07_sprint4_fulfilment_compliance.sql — Sprint 4 (beta readiness)
-- Run after 06_sprint3_marketplace_refills.sql. Safe to re-run.
--
-- 1. Pharmacist identity + prescription details and per-product quantities (C-08)
-- 2. Schedule H1 register (C-09)
-- 3. Price compliance: sell prices ≤ MRP, MRP ≤ NPPA ceiling (C-16)
-- 4. Grievances (C-36)
-- 5. Batch recalls (C-28)
-- 6. Data-rights requests (C-44)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Prescriptions ─────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pharmacist_reg_no VARCHAR(50);   -- State Pharmacy Council registration

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS prescriber_name    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS prescriber_reg_no  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS prescribed_on      DATE,
  ADD COLUMN IF NOT EXISTS patient_name       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS pharmacist_reg_no  VARCHAR(50);

-- What the prescription allows, and how much has been dispensed against it
CREATE TABLE IF NOT EXISTS prescription_items (
  prescription_id  UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id),
  prescribed_qty   INTEGER NOT NULL CHECK (prescribed_qty > 0),
  dispensed_qty    INTEGER NOT NULL DEFAULT 0 CHECK (dispensed_qty >= 0),
  PRIMARY KEY (prescription_id, product_id),
  CHECK (dispensed_qty <= prescribed_qty)
);

-- Which prescription covers which order line
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS prescription_id UUID REFERENCES prescriptions(id);

-- ── 2. Schedule H1 register (keep ≥ 3 years; never updated or deleted) ────────
CREATE TABLE IF NOT EXISTS h1_register (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispensed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seller_type         VARCHAR(10) NOT NULL CHECK (seller_type IN ('dawabag', 'partner')),
  partner_id          UUID REFERENCES vendors(id),
  order_id            UUID NOT NULL REFERENCES orders(id),
  order_item_id       UUID NOT NULL REFERENCES order_items(id) UNIQUE,
  product_id          UUID NOT NULL REFERENCES products(id),
  product_name        VARCHAR(500) NOT NULL,
  batch_number        VARCHAR(100),
  quantity            INTEGER NOT NULL,
  patient_name        VARCHAR(255) NOT NULL,
  patient_address     TEXT NOT NULL,
  prescriber_name     VARCHAR(255) NOT NULL,
  prescriber_reg_no   VARCHAR(100),
  prescription_id     UUID REFERENCES prescriptions(id),
  pharmacist_name     VARCHAR(255),
  pharmacist_reg_no   VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS idx_h1_register_date ON h1_register(dispensed_at);

-- ── 3. Price compliance ──────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS nppa_ceiling_price_paise INTEGER;  -- per unit, for scheduled formulations

-- Bring any existing rows into line before adding the checks
UPDATE products SET offer_price_paise = mrp_paise WHERE offer_price_paise > mrp_paise;
UPDATE products SET ptr_price_paise = mrp_paise WHERE ptr_price_paise > mrp_paise;
UPDATE products SET pts_price_paise = mrp_paise WHERE pts_price_paise > mrp_paise;
UPDATE products SET institutional_price_paise = mrp_paise WHERE institutional_price_paise > mrp_paise;

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_price_le_mrp;
ALTER TABLE products ADD CONSTRAINT products_price_le_mrp CHECK (
  offer_price_paise <= mrp_paise
  AND (ptr_price_paise IS NULL OR ptr_price_paise <= mrp_paise)
  AND (pts_price_paise IS NULL OR pts_price_paise <= mrp_paise)
  AND (institutional_price_paise IS NULL OR institutional_price_paise <= mrp_paise)
);
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_mrp_le_ceiling;
ALTER TABLE products ADD CONSTRAINT products_mrp_le_ceiling CHECK (
  nppa_ceiling_price_paise IS NULL OR mrp_paise <= nppa_ceiling_price_paise
);

-- ── 4. Grievances ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grievances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no        VARCHAR(20) UNIQUE NOT NULL,
  user_id          UUID NOT NULL REFERENCES users(id),
  order_id         UUID REFERENCES orders(id),
  category         VARCHAR(30) NOT NULL CHECK (category IN (
                     'order', 'delivery', 'product_quality', 'refund', 'prescription',
                     'privacy', 'pricing', 'other')),
  subject          VARCHAR(200) NOT NULL,
  description      TEXT NOT NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'acknowledged', 'in_progress', 'resolved', 'closed')),
  acknowledged_at  TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  resolution       TEXT,
  assigned_to      UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_grievances_user   ON grievances(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grievances_status ON grievances(status, created_at);

CREATE TABLE IF NOT EXISTS grievance_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id  UUID NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  author_id     UUID NOT NULL REFERENCES users(id),
  from_staff    BOOLEAN NOT NULL,
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE SEQUENCE IF NOT EXISTS grievance_ticket_seq;

-- ── 5. Batch recalls ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS batch_recalls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id),
  batch_number    VARCHAR(100) NOT NULL,
  reason          TEXT NOT NULL,
  source          VARCHAR(100),               -- e.g. 'CDSCO NSQ alert Sep-2026'
  recalled_by     UUID REFERENCES users(id),
  recalled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, batch_number)
);

ALTER TABLE inventory_batches
  ADD COLUMN IF NOT EXISTS is_recalled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE partner_inventory
  ADD COLUMN IF NOT EXISTS is_recalled BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 6. Data-rights requests ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS data_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  request_type  VARCHAR(20) NOT NULL CHECK (request_type IN ('erasure', 'correction')),
  details       TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'completed', 'rejected')),
  outcome       TEXT,
  handled_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_at    TIMESTAMPTZ
);

-- ── Settings for the legal footer (C-04) and grievance officer (C-36) ────────
INSERT INTO app_settings (key, value, description) VALUES
  ('legal.entity', '{"name": "Dawabag Private Limited", "address": "", "gstin": "", "cin": ""}',
   'Legal entity shown in the site footer and on invoices'),
  ('legal.drug_licences', '{"retail_20": "", "retail_21": "", "wholesale_20b": "", "wholesale_21b": "", "valid_upto": ""}',
   'Dawabag drug licence numbers shown in the footer (C-04)'),
  ('legal.pharmacist_in_charge', '{"name": "", "registration_no": ""}',
   'Registered pharmacist in charge (C-03)'),
  ('legal.grievance_officer', '{"name": "", "email": "", "phone": "", "address": ""}',
   'Grievance officer shown on the site (C-36)')
ON CONFLICT (key) DO NOTHING;
