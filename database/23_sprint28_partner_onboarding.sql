-- ============================================================
-- Sprint 28 — Dawabag's admin onboards a marketplace partner directly
--   1. Partner drug licences: one row per licence a partner holds
--      (retail Form 20 / 21, wholesale Form 20B / 21B), each with its own
--      number and valid-till date (C-02, C-07, C-33). vendors.drug_license_no /
--      _type / _expiry stay as the summary every seller check already reads.
--   2. Registered pharmacists of a partner (name + State Pharmacy Council
--      registration number; C-03, C-08).
--   3. Temporary passwords: users.must_change_password — set when an admin
--      creates a login, cleared when its holder chooses a new password.
-- Re-runnable (IF NOT EXISTS).
-- ============================================================

-- ── 1. Partner drug licences ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_licences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  licence_type    VARCHAR(10) NOT NULL CHECK (licence_type IN ('dl20', 'dl21', 'dl20b', 'dl21b')),
  licence_number  VARCHAR(100) NOT NULL,
  valid_upto      DATE NOT NULL,
  issued_by       VARCHAR(200),
  last_alert_days INTEGER,                    -- for a future renewal-alert job (C-07)
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id, licence_type),            -- one licence of each form per partner
  UNIQUE (licence_type, licence_number)        -- a licence belongs to one partner
);
CREATE INDEX IF NOT EXISTS idx_vendor_licences_expiry ON vendor_licences(valid_upto);

-- ── 2. Partner pharmacists ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_pharmacists (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id        UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  full_name        VARCHAR(200) NOT NULL,
  registration_no  VARCHAR(100) NOT NULL,     -- State Pharmacy Council registration
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       UUID REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id, registration_no)
);

-- ── 3. Business details and temporary passwords ──────────────────────────────
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS trade_name     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_line2  VARCHAR(500),
  ADD COLUMN IF NOT EXISTS created_by     UUID REFERENCES users(id);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS password_changed_at  TIMESTAMPTZ;
