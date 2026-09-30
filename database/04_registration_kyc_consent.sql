-- ─────────────────────────────────────────────────────────────────────────────
-- 04_registration_kyc_consent.sql — Sprint 1
-- Run after 03_compatibility_patch_v2.sql. Safe to re-run.
--
-- 1. Registration fields the 4-step sign-up collects; audit_logs.performed_by
-- 2. kyc_documents: one uploaded file per user per document type
-- 3. consent_records: append-only privacy/age/marketing consent log
--    (Compliance Rulebook C-40, C-42)
-- 4. Order table fixes: order_items.gst_amount_paise, orders.buyer_drug_license,
--    'confirmed' status
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Registration fields ───────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS registration_pincode VARCHAR(6),
  ADD COLUMN IF NOT EXISTS doctor_speciality    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS age_confirmed_at     TIMESTAMPTZ;

-- audit_logs.performed_by and notes are written by the order and KYC code but was never
-- created by 01–03 (every such insert failed)
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS notes        TEXT;

-- ── 2. KYC document files ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kyc_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type  VARCHAR(40) NOT NULL
    CHECK (document_type IN ('drug_license','pan_card','gst_certificate',
                             'nmc_certificate','cancelled_cheque','clinic_address_proof')),
  storage_key    VARCHAR(500) NOT NULL,      -- S3 key (or local path in development)
  original_name  VARCHAR(255),
  mime_type      VARCHAR(100) NOT NULL,
  size_bytes     INTEGER NOT NULL,
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A re-upload replaces the previous file for that type
  UNIQUE (user_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_kyc_documents_user ON kyc_documents(user_id);

-- ── 3. Consent log ───────────────────────────────────────────────────────────
-- Never updated or deleted: a withdrawal is a new row with granted = FALSE.
CREATE TABLE IF NOT EXISTS consent_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose         VARCHAR(40) NOT NULL
    CHECK (purpose IN ('privacy_notice','age_18_plus','marketing')),
  granted         BOOLEAN NOT NULL,
  policy_version  VARCHAR(20) NOT NULL,
  ip_address      VARCHAR(45),
  user_agent      VARCHAR(500),
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_user_purpose
  ON consent_records(user_id, purpose, recorded_at DESC);

-- ── 4. Order fixes (order creation failed against 01–03) ─────────────────────
-- order.controller writes gst_amount_paise per line
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS gst_amount_paise INTEGER NOT NULL DEFAULT 0;

-- Buyer's drug licence printed on B2B invoices (Rulebook C-13)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS buyer_drug_license VARCHAR(100);

-- Credit/CAD orders start as 'confirmed', which the original list lacked
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN (
  'pending_payment', 'payment_failed', 'confirmed',
  'rx_pending', 'rx_verified', 'rx_rejected',
  'packing', 'packed', 'dispatched', 'delivered', 'cancelled', 'returned'
));
