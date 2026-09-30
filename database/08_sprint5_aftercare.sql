-- ─────────────────────────────────────────────────────────────────────────────
-- 08_sprint5_aftercare.sql — Sprint 5 (after-sale care and consumer protection)
-- Run after 07_sprint4_fulfilment_compliance.sql. Safe to re-run.
--
-- 1. Cancellation fields, refunds ledger, GST credit notes (C-30, C-37)
-- 2. Return requests — returned medicines are never restocked (C-37)
-- 3. Partner settlement adjustments for returns (C-32)
-- 4. Versioned policy documents (C-39)
-- 5. Product declarations and pharmacist copy review (C-17, C-19)
-- 6. Sealed dispatch and delivery handover code (C-26)
-- 7. Side-effect reports for PvPI (C-29)
-- 8. Dawabag licence register (C-07); practitioner declaration on orders (C-15)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Cancellation, refunds, credit notes ───────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cancelled_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by            UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason     TEXT,
  ADD COLUMN IF NOT EXISTS credit_adjusted_paise   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS practitioner_declared_at TIMESTAMPTZ;

-- One row per refund leg: the gateway part, the wallet part, a reduction of an
-- unpaid credit bill, or a manual bank refund recorded by accounts.
CREATE TABLE IF NOT EXISTS refunds (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID NOT NULL REFERENCES orders(id),
  return_id          UUID,                                 -- FK added below
  source             VARCHAR(20) NOT NULL CHECK (source IN ('cancellation', 'return', 'admin')),
  method             VARCHAR(20) NOT NULL CHECK (method IN ('gateway', 'wallet', 'credit_adjustment', 'manual')),
  amount_paise       INTEGER NOT NULL CHECK (amount_paise > 0),
  status             VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  gateway_payment_id VARCHAR(255),
  gateway_refund_id  VARCHAR(255) UNIQUE,
  reference          VARCHAR(100),                         -- UTR for manual refunds
  failure_reason     TEXT,
  requested_by       UUID REFERENCES users(id),
  processed_by       UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_refunds_order  ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status, created_at);

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded'));

-- A credit note reverses (part of) a shipment's tax invoice. Numbered in the
-- seller's own gap-free series, e.g. DWB-CN/2026-27/000001.
CREATE TABLE IF NOT EXISTS credit_notes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_number  VARCHAR(40) NOT NULL UNIQUE,
  shipment_id         UUID NOT NULL REFERENCES order_shipments(id),
  order_id            UUID NOT NULL REFERENCES orders(id),
  return_id           UUID,
  reason              VARCHAR(30) NOT NULL,
  taxable_paise       INTEGER NOT NULL,
  cgst_paise          INTEGER NOT NULL DEFAULT 0,
  sgst_paise          INTEGER NOT NULL DEFAULT 0,
  igst_paise          INTEGER NOT NULL DEFAULT 0,
  total_paise         INTEGER NOT NULL,
  created_by          UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_notes_shipment ON credit_notes(shipment_id);

CREATE TABLE IF NOT EXISTS credit_note_items (
  credit_note_id  UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  order_item_id   UUID NOT NULL REFERENCES order_items(id),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  taxable_paise   INTEGER NOT NULL,
  gst_paise       INTEGER NOT NULL,
  PRIMARY KEY (credit_note_id, order_item_id)
);

-- ── 2. Returns ───────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS return_no_seq;

CREATE TABLE IF NOT EXISTS return_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_no       VARCHAR(20) NOT NULL UNIQUE,
  order_id        UUID NOT NULL REFERENCES orders(id),
  shipment_id     UUID NOT NULL REFERENCES order_shipments(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  reason          VARCHAR(20) NOT NULL CHECK (reason IN (
                    'damaged', 'wrong_item', 'missing_item', 'expired', 'near_expiry', 'quality_issue', 'recalled')),
  description     TEXT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'requested'
                    CHECK (status IN ('requested', 'approved', 'rejected', 'closed')),
  refund_paise    INTEGER NOT NULL DEFAULT 0,
  decided_by      UUID REFERENCES users(id),
  decided_at      TIMESTAMPTZ,
  decision_notes  TEXT,
  -- Physical goods: collected and destroyed or sent back to the supplier, never restocked
  disposition     VARCHAR(25) CHECK (disposition IN ('destroyed', 'returned_to_supplier', 'not_collected')),
  disposed_at     TIMESTAMPTZ,
  disposed_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_returns_user   ON return_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_returns_status ON return_requests(status, created_at);

CREATE TABLE IF NOT EXISTS return_items (
  return_id      UUID NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  order_item_id  UUID NOT NULL REFERENCES order_items(id),
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (return_id, order_item_id)
);

DO $$ BEGIN
  ALTER TABLE refunds ADD CONSTRAINT refunds_return_fk FOREIGN KEY (return_id) REFERENCES return_requests(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE credit_notes ADD CONSTRAINT credit_notes_return_fk FOREIGN KEY (return_id) REFERENCES return_requests(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Settlement adjustments (returns on partner shipments) ─────────────────
CREATE TABLE IF NOT EXISTS settlement_adjustments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id           UUID NOT NULL REFERENCES vendors(id),
  return_id            UUID REFERENCES return_requests(id),
  credit_note_id       UUID REFERENCES credit_notes(id),
  taxable_paise        INTEGER NOT NULL,     -- negative: reduces the partner's net sales
  gst_paise            INTEGER NOT NULL,
  reason               TEXT NOT NULL,
  settlement_batch_id  UUID REFERENCES settlement_batches(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_settle_adj_open ON settlement_adjustments(partner_id) WHERE settlement_batch_id IS NULL;

-- ── 4. Policy documents ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_key         VARCHAR(20) NOT NULL CHECK (doc_key IN ('terms', 'privacy', 'shipping', 'cancellation', 'refund')),
  version         INTEGER NOT NULL,
  title           VARCHAR(200) NOT NULL,
  body            TEXT NOT NULL,
  effective_from  DATE NOT NULL,
  lawyer_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  published_by    UUID REFERENCES users(id),
  published_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (doc_key, version)
);

-- ── 5. Product declarations and copy review ──────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS net_quantity          VARCHAR(50),     -- e.g. '10 tablets', '100 ml'
  ADD COLUMN IF NOT EXISTS manufacturer_name     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS manufacturer_address  TEXT,
  ADD COLUMN IF NOT EXISTS country_of_origin     VARCHAR(60) DEFAULT 'India',
  ADD COLUMN IF NOT EXISTS content_status        VARCHAR(20) NOT NULL DEFAULT 'pending_review',
  ADD COLUMN IF NOT EXISTS content_flags         JSONB,
  ADD COLUMN IF NOT EXISTS content_reviewed_by   UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS content_reviewed_at   TIMESTAMPTZ;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_content_status_check;
ALTER TABLE products ADD CONSTRAINT products_content_status_check
  CHECK (content_status IN ('pending_review', 'approved', 'rejected'));

-- ── 6. Sealed dispatch and handover ──────────────────────────────────────────
ALTER TABLE order_shipments
  ADD COLUMN IF NOT EXISTS seal_number          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS handover_code_hash   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS handover_attempts    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_by_name     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS received_by_relation VARCHAR(30),
  ADD COLUMN IF NOT EXISTS handover_override    TEXT,
  ADD COLUMN IF NOT EXISTS delivered_by         UUID REFERENCES users(id);

-- ── 7. Side-effect (adverse drug reaction) reports ──────────────────────────
CREATE SEQUENCE IF NOT EXISTS adr_report_seq;

CREATE TABLE IF NOT EXISTS adverse_event_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_no         VARCHAR(20) NOT NULL UNIQUE,
  user_id           UUID NOT NULL REFERENCES users(id),
  order_id          UUID REFERENCES orders(id),
  product_id        UUID NOT NULL REFERENCES products(id),
  batch_number      VARCHAR(100),
  patient_initials  VARCHAR(10) NOT NULL,
  patient_age_years INTEGER CHECK (patient_age_years BETWEEN 0 AND 120),
  patient_gender    VARCHAR(10) CHECK (patient_gender IN ('male', 'female', 'other')),
  reaction          TEXT NOT NULL,
  onset_date        DATE,
  seriousness       VARCHAR(20) NOT NULL CHECK (seriousness IN ('non_serious', 'hospitalised', 'life_threatening', 'disability', 'death', 'other_serious')),
  outcome           VARCHAR(20) CHECK (outcome IN ('recovered', 'recovering', 'not_recovered', 'fatal', 'unknown')),
  status            VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'forwarded', 'closed')),
  pharmacist_notes  TEXT,
  pvpi_reference    VARCHAR(100),
  reviewed_by       UUID REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ,
  forwarded_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adr_status ON adverse_event_reports(status, created_at);

-- ── 8. Licence register ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_licences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  licence_type    VARCHAR(30) NOT NULL CHECK (licence_type IN (
                    'retail_20', 'retail_21', 'wholesale_20b', 'wholesale_21b', 'gst', 'shop_establishment',
                    'fssai', 'trade', 'other')),
  licence_number  VARCHAR(100) NOT NULL,
  issued_by       VARCHAR(200),
  premises        VARCHAR(300),
  valid_from      DATE,
  valid_upto      DATE,                        -- NULL = no expiry (e.g. GST)
  renewal_owner   VARCHAR(100) NOT NULL,
  renewal_owner_email VARCHAR(255),
  notes           TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_alert_days INTEGER,                     -- the last threshold alerted (60/30/7/0)
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (licence_type, licence_number)
);

-- ── Settings ─────────────────────────────────────────────────────────────────
INSERT INTO app_settings (key, value, description) VALUES
  ('returns.report_within_hours', '48',
   'Damaged, wrong or missing items must be reported within this many hours of delivery (C-37)'),
  ('returns.expiry_claim_days', '30',
   'Expired, near-expiry or quality claims accepted within this many days of delivery (C-37)'),
  ('returns.near_expiry_days', '90',
   'A delivered batch expiring within this many days of delivery counts as near-expiry'),
  ('delivery.handover_code_scope', '"rx_only"',
   'Who must give the delivery code: rx_only (prescription orders), all, or off (C-26)')
ON CONFLICT (key) DO NOTHING;
