-- ─────────────────────────────────────────────────────────────────────────────
-- Dawabag — KYC Verifications Table
-- Migration: add_kyc_verifications.sql
-- Run after migration.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- KYC verifications audit log — one row per document per user
-- Stores both automated (API) and manual (admin) verification results
CREATE TABLE IF NOT EXISTS kyc_verifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- What was verified
  document_type         VARCHAR(50) NOT NULL,
  -- Values: gstin | pan | pan_name_mismatch | drug_license_dl20 | drug_license_dl21
  --         drug_license_dl20c | drug_license_dl21c | nmc_registration
  --         cancelled_cheque | establishment_cert

  input_value           VARCHAR(100) NOT NULL,
  -- The actual document number entered by the user

  -- How it was verified
  verification_method   VARCHAR(50) NOT NULL,
  -- Values: api_gstn | api_surepass | api_protean | admin_manual | admin_manual_nmc
  --         system_auto

  -- Result
  result                VARCHAR(30) NOT NULL,
  -- Values: verified | failed | pending_admin | api_error | pending_renewal | flagged

  raw_response          JSONB,
  -- Full API response or admin notes stored as JSON

  -- Timestamps
  verified_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_by_admin_id  UUID REFERENCES users(id),  -- NULL for API-based checks

  -- Prevent duplicate entries per user per document type
  -- If re-verified, update existing row (ON CONFLICT DO UPDATE)
  UNIQUE (user_id, document_type)
);

-- Indexes for admin KYC queue
CREATE INDEX IF NOT EXISTS idx_kyc_verif_user      ON kyc_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_verif_result    ON kyc_verifications(result);
CREATE INDEX IF NOT EXISTS idx_kyc_verif_doc_type  ON kyc_verifications(document_type);
CREATE INDEX IF NOT EXISTS idx_kyc_verif_admin     ON kyc_verifications(verified_by_admin_id)
  WHERE verified_by_admin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kyc_verif_pending   ON kyc_verifications(user_id, result)
  WHERE result IN ('pending_admin', 'api_error', 'flagged');

-- ─────────────────────────────────────────────────────────────────────────────
-- Additional columns for users table (KYC verification tracking)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS kyc_status
    VARCHAR(30) DEFAULT 'not_required'
    CHECK (kyc_status IN (
      'not_required',  -- B2C customers
      'pending_otp',   -- OTP not yet verified
      'pending_kyc',   -- Docs uploaded, awaiting admin review
      'approved',      -- All checks passed, account active
      'rejected',      -- One or more checks failed
      'suspended',     -- Admin suspended account
      'pending_renewal', -- Drug license expiring, renewal needed
      'flagged_gstin'  -- GSTIN became inactive on re-check
    )),

  ADD COLUMN IF NOT EXISTS kyc_submitted_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_approved_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT,

  -- GST verification fields
  ADD COLUMN IF NOT EXISTS gstin                VARCHAR(15),
  ADD COLUMN IF NOT EXISTS gstin_verified       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gst_unregistered_declaration BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gstin_legal_name     VARCHAR(200),
  ADD COLUMN IF NOT EXISTS gstin_trade_name     VARCHAR(200),
  ADD COLUMN IF NOT EXISTS gstin_status         VARCHAR(30),  -- Active | Cancelled | Suspended
  ADD COLUMN IF NOT EXISTS gstin_last_checked   TIMESTAMPTZ,

  -- PAN verification fields
  ADD COLUMN IF NOT EXISTS pan_number           VARCHAR(10),
  ADD COLUMN IF NOT EXISTS pan_verified         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pan_name_as_per_pan  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS pan_type             VARCHAR(30),  -- Individual | Company | Firm

  -- Drug license fields
  ADD COLUMN IF NOT EXISTS drug_license_number   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS drug_license_type     VARCHAR(20)
    CHECK (drug_license_type IN ('dl20','dl21','dl20c','dl21c','none')),
  ADD COLUMN IF NOT EXISTS drug_license_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS drug_license_expiry   DATE,
  ADD COLUMN IF NOT EXISTS drug_license_holder_name VARCHAR(200),

  -- NMC / Medical Council fields (Type 4 doctors)
  ADD COLUMN IF NOT EXISTS nmc_reg_number       VARCHAR(50),
  ADD COLUMN IF NOT EXISTS nmc_reg_verified     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS nmc_council_state    VARCHAR(50),
  ADD COLUMN IF NOT EXISTS nmc_doctor_name_as_per_register VARCHAR(200),
  ADD COLUMN IF NOT EXISTS nmc_qualification    VARCHAR(100),

  -- Account upgrade tracking (doc_hospital → b2b_retailer)
  ADD COLUMN IF NOT EXISTS account_upgrade_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_upgrade_from VARCHAR(50),
  ADD COLUMN IF NOT EXISTS account_upgrade_by   UUID REFERENCES users(id),

  -- Business details for B2B
  ADD COLUMN IF NOT EXISTS business_name        VARCHAR(200),
  ADD COLUMN IF NOT EXISTS customer_type        VARCHAR(30) DEFAULT 'customer'
    CHECK (customer_type IN (
      'customer', 'b2b_retailer', 'b2b_wholesaler',
      'doc_hospital', 'doctor', 'pharmacist_rx',
      'pharmacist_pack', 'delivery', 'admin', 'super_admin'
    ));

-- ─────────────────────────────────────────────────────────────────────────────
-- Admin KYC queue VIEW — makes it easy for admin to see what needs review
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW admin_kyc_queue AS
SELECT
  u.id                    AS user_id,
  u.full_name,
  u.mobile,
  u.email,
  u.customer_type,
  u.business_name,
  u.kyc_status,
  u.kyc_submitted_at,
  u.drug_license_number,
  u.drug_license_type,
  u.drug_license_expiry,
  u.gstin,
  u.gstin_verified,
  u.pan_number,
  u.pan_verified,
  u.nmc_reg_number,
  u.nmc_reg_verified,
  u.nmc_council_state,

  -- Pending checks count
  (
    SELECT COUNT(*) FROM kyc_verifications kv
    WHERE kv.user_id = u.id AND kv.result = 'pending_admin'
  ) AS pending_checks,

  -- Portal link for DL verification
  CASE
    WHEN LEFT(u.mobile, 2) = '27' THEN 'https://fda.maharashtra.gov.in/'
    ELSE 'https://www.cdsco.gov.in/opencms/opencms/en/DrugLicence/'
  END AS dl_portal_url,

  -- NMC portal link
  'https://www.nmc.org.in/information-desk/indian-medical-register/' AS nmc_portal_url,

  u.created_at            AS registered_at

FROM users u
WHERE u.kyc_status IN ('pending_kyc', 'pending_renewal', 'flagged_gstin')
  AND u.customer_type IN ('b2b_retailer', 'b2b_wholesaler', 'doc_hospital')
ORDER BY u.kyc_submitted_at ASC NULLS LAST;  -- FIFO queue — oldest first

-- ─────────────────────────────────────────────────────────────────────────────
-- Re-verification schedule tracking
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kyc_reverification_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  reverif_type    VARCHAR(50) NOT NULL,  -- 'gstin_monthly' | 'dl_expiry_check' | 'admin_manual'
  result          VARCHAR(30) NOT NULL,
  previous_status VARCHAR(30),
  new_status      VARCHAR(30),
  notes           TEXT,
  run_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reverif_user ON kyc_reverification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_reverif_type ON kyc_reverification_log(reverif_type, run_at);
