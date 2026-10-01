-- ─────────────────────────────────────────────────────────────────────────────
-- 06_sprint3_marketplace_refills.sql — Sprint 3
-- Run after 05_sprint2_credit_jobs.sql. Safe to re-run.
--
-- 1. app_settings: business rules the owner can change without a release
-- 2. Pincode geo + Dawabag delivery hours (allocation, 24-hour rule)
-- 3. Partner users (role 'partner', vendor_users)
-- 4. Gap-free invoice numbering per seller per financial year (C-30)
-- 5. order_shipments: one shipment + invoice per seller of record (C-05)
-- 6. Partner products: catalogue-price model, Schedule H1 listing gate
-- 7. Settlements: GST on fees, TCS (CGST s.52), TDS (s.194-O) (C-32)
-- 8. Refills: items, reminders, payment mandates
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Settings (server is the single source of truth) ───────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key          VARCHAR(80) PRIMARY KEY,
  value        JSONB NOT NULL,
  description  TEXT,
  updated_by   UUID REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (key, value, description) VALUES
  ('allocation.own_first_min_order_paise', '1000000',
   'Orders above this value (₹10,000) are filled from Dawabag stock first when deliverable in time'),
  ('allocation.own_first_max_delivery_hours', '24',
   'Dawabag must reach the pincode within this many hours for the own-stock-first rule'),
  ('dawabag.premises', '{"pincode": "422001", "latitude": 19.9975, "longitude": 73.7898}',
   'Dawabag dispatch premises used for distance comparison (update to the licensed address)'),
  ('marketplace.tcs_pct', '0.5', 'TCS on partner net taxable supplies, CGST s.52 — CA to confirm current rate'),
  ('marketplace.tds_pct', '0.1', 'TDS on partner gross sales, Income-tax s.194-O — CA to confirm current rate'),
  ('marketplace.fee_gst_pct', '18', 'GST on Dawabag commission and finding fee'),
  ('refill.reminder_days_before', '3', 'Days before the refill date to remind the buyer (also the pre-debit notice)')
ON CONFLICT (key) DO NOTHING;

-- ── 2. Pincode geo + Dawabag delivery time ───────────────────────────────────
ALTER TABLE pincode_serviceability
  ADD COLUMN IF NOT EXISTS latitude               NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS longitude              NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS dawabag_delivery_hours INTEGER;   -- NULL = Dawabag does not deliver here itself

-- ── 3. Partner users ─────────────────────────────────────────────────────────
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
  'customer', 'doctor', 'pharmacy', 'partner',
  'pharmacist_rx', 'pharmacist_pack', 'delivery', 'admin', 'super_admin'
));

CREATE TABLE IF NOT EXISTS vendor_users (
  vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (vendor_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_users_user ON vendor_users(user_id);  -- one partner per login

-- ── 4. Gap-free invoice numbers ──────────────────────────────────────────────
-- A counter row per (series, financial year), updated inside the order
-- transaction: a failed order rolls its number back, so there are no gaps.
CREATE TABLE IF NOT EXISTS invoice_series (
  series_key   VARCHAR(60) NOT NULL,      -- 'DWB' or 'P:<vendor uuid>'
  fy           VARCHAR(9)  NOT NULL,      -- '2026-27'
  prefix       VARCHAR(16) NOT NULL,
  last_number  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (series_key, fy)
);

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS invoice_prefix VARCHAR(16);    -- set at partner approval
CREATE UNIQUE INDEX IF NOT EXISTS idx_vendors_invoice_prefix
  ON vendors(invoice_prefix) WHERE invoice_prefix IS NOT NULL;

CREATE OR REPLACE FUNCTION next_invoice_number(p_series VARCHAR, p_prefix VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_fy  VARCHAR(9);
  v_num INTEGER;
BEGIN
  v_fy := CASE
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
      THEN EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || RIGHT((EXTRACT(YEAR FROM CURRENT_DATE) + 1)::TEXT, 2)
    ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::TEXT || '-' || RIGHT(EXTRACT(YEAR FROM CURRENT_DATE)::TEXT, 2)
  END;
  INSERT INTO invoice_series (series_key, fy, prefix, last_number)
  VALUES (p_series, v_fy, p_prefix, 1)
  ON CONFLICT (series_key, fy) DO UPDATE SET last_number = invoice_series.last_number + 1
  RETURNING last_number INTO v_num;
  RETURN p_prefix || '/' || v_fy || '/' || LPAD(v_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ── 5. Shipments: one per seller of record ───────────────────────────────────
CREATE TABLE IF NOT EXISTS order_shipments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seller_type      VARCHAR(10) NOT NULL CHECK (seller_type IN ('dawabag', 'partner')),
  partner_id       UUID REFERENCES vendors(id),
  invoice_number   VARCHAR(40) NOT NULL UNIQUE,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'packed', 'dispatched', 'delivered', 'cancelled', 'returned')),
  subtotal_paise   INTEGER NOT NULL DEFAULT 0,
  gst_paise        INTEGER NOT NULL DEFAULT 0,
  total_paise      INTEGER NOT NULL DEFAULT 0,
  cold_chain       BOOLEAN NOT NULL DEFAULT FALSE,
  allocation_note  TEXT,
  courier_partner  VARCHAR(50),
  awb_number       VARCHAR(100),
  dispatched_at    TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((seller_type = 'partner') = (partner_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_shipments_order   ON order_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_partner ON order_shipments(partner_id, status) WHERE partner_id IS NOT NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS shipment_id UUID REFERENCES order_shipments(id);

-- ── 6. Partner products: catalogue price + H1 gate ───────────────────────────
-- Partners sell at Dawabag's catalogue price (DECISIONS.md), so they no
-- longer quote a supply price.
ALTER TABLE partner_products ALTER COLUMN supply_price_paise DROP NOT NULL;
ALTER TABLE partner_products
  ADD COLUMN IF NOT EXISTS catalogue_price_accepted   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS h1_pharmacist_name         VARCHAR(200),
  ADD COLUMN IF NOT EXISTS h1_pharmacist_reg_no       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS h1_secure_storage_declared BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS h1_declared_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by               UUID REFERENCES users(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pp_partner_product
  ON partner_products(partner_id, product_id) WHERE product_id IS NOT NULL;

ALTER TABLE partner_order_items
  ADD COLUMN IF NOT EXISTS shipment_id        UUID REFERENCES order_shipments(id),
  ADD COLUMN IF NOT EXISTS line_value_paise   INTEGER,     -- taxable value sold to the buyer
  ADD COLUMN IF NOT EXISTS line_gst_paise     INTEGER;
ALTER TABLE partner_order_items ALTER COLUMN supply_price_paise DROP NOT NULL;

-- ── 7. Settlements ───────────────────────────────────────────────────────────
ALTER TABLE settlement_batches
  ADD COLUMN IF NOT EXISTS taxable_value_paise    BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gst_collected_paise    BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_gst_paise          BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tcs_paise              BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_paise              BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tcs_pct                NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS tds_pct                NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS commission_invoice_no  VARCHAR(40),
  ADD COLUMN IF NOT EXISTS paid_by                UUID REFERENCES users(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_settle_partner_period
  ON settlement_batches(partner_id, period_from, period_to);

-- ── 8. Refills ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_mandates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gateway             VARCHAR(20) NOT NULL DEFAULT 'razorpay',
  gateway_customer_id VARCHAR(100),
  gateway_order_id    VARCHAR(100),          -- registration order
  gateway_token_id    VARCHAR(100),          -- set when the mandate is authorised
  method              VARCHAR(20),           -- upi | card | emandate
  max_amount_paise    INTEGER NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'cancelled', 'failed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at        TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_mandates_user ON payment_mandates(user_id, status);

ALTER TABLE refill_subscriptions
  ADD COLUMN IF NOT EXISTS address_id          UUID REFERENCES addresses(id),
  ADD COLUMN IF NOT EXISTS mandate_id          UUID REFERENCES payment_mandates(id),
  ADD COLUMN IF NOT EXISTS reminded_for_date   DATE,
  ADD COLUMN IF NOT EXISTS last_order_id       UUID REFERENCES orders(id),
  ADD COLUMN IF NOT EXISTS cancelled_at        TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS refill_items (
  subscription_id UUID NOT NULL REFERENCES refill_subscriptions(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (subscription_id, product_id)
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refill_subscription_id UUID REFERENCES refill_subscriptions(id),
  ADD COLUMN IF NOT EXISTS refill_for_date        DATE;

-- A refill is ordered at most once per refill date, even if the job re-runs
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_refill_once
  ON orders(refill_subscription_id, refill_for_date) WHERE refill_subscription_id IS NOT NULL;
