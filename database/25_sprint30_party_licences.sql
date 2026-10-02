-- ============================================================
-- Sprint 30 — every drug licence of every party, in one register
--   Owner request (2 Oct 2026): "All the Drug Licences should be saved and
--   displayed" — retailers, wholesalers, suppliers / companies and partners.
--
--   1. party_licences: one row per drug licence held by a vendor (marketplace
--      partner and/or supplier) or by a buyer account (retailer, wholesaler,
--      doctor / hospital). Form, number, issuing authority, valid from / till,
--      a scan in the private object store, and who checked it (C-02, C-07,
--      C-11, C-33). A buyer's or partner's renewal waits as 'pending' next to
--      the checked licence until an admin verifies it; the old one is then
--      'superseded' (kept, never edited away).
--   2. vendor_licences (Sprint 28) is moved into it and kept as a read view.
--   3. Existing single licences (vendors.drug_license_*, users.drug_license_*,
--      pharmacy_profiles) are copied in without loss.
--   4. vendors / users drug_license_no|number / _type / _expiry stay as a DERIVED
--      summary (trigger): the first form held and the EARLIEST valid-till of the
--      checked licences, so every existing check (partner selling C-33, supplier
--      purchases C-02, buyer KYC and the daily expiry block C-14) now considers
--      all licences — any lapsed licence stops the activity until renewed.
--   5. Dawabag's own drug licences: the licence register (business_licences,
--      C-07) is the single authority; the old 'legal.drug_licences' setting is
--      copied in and removed (it was a second authority for the same numbers).
--   6. Snapshots on orders / shipments so a B2B invoice prints the buyer's and
--      the seller's licences as they were on the day of sale (C-13).
-- Re-runnable.
-- ============================================================

-- Forms (Drugs and Cosmetics Rules, 1945):
--   dl20 / dl21    retail (21: Schedule C and C1)       dl20a / dl21a  restricted retail
--   dl20b / dl21b  wholesale (owner decision 30 Sep 2026)
--   dl20c / dl20d  homoeopathic retail / wholesale      dl20f / dl20g  Schedule X retail / wholesale
--   dl25 / dl28    manufacture (28: Schedule C and C1)  dl25a / dl28a  loan licence   dl25b  repacking
--   other          any other form, named in form_name

-- ── 1. The register ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS party_licences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id         UUID REFERENCES vendors(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
  party_type        VARCHAR(10) GENERATED ALWAYS AS (CASE WHEN vendor_id IS NOT NULL THEN 'vendor' ELSE 'customer' END) STORED,
  form              VARCHAR(10) NOT NULL CHECK (form IN (
                      'dl20', 'dl21', 'dl20a', 'dl21a', 'dl20b', 'dl21b', 'dl20c', 'dl20d', 'dl20f', 'dl20g',
                      'dl25', 'dl25a', 'dl25b', 'dl28', 'dl28a', 'other')),
  form_name         VARCHAR(80),               -- required for 'other' ("Form 21C", "State hospital pharmacy licence")
  licence_number    VARCHAR(100) NOT NULL,
  -- Same number however it is typed (spaces, dashes, slashes, case): duplicates across parties are refused
  number_key        VARCHAR(100) GENERATED ALWAYS AS (upper(regexp_replace(licence_number, '[^A-Za-z0-9]', '', 'g'))) STORED,
  issued_by         VARCHAR(200),              -- licensing authority / state
  valid_from        DATE,
  valid_upto        DATE,                      -- required to verify; a buyer may leave it for the admin
  status            VARCHAR(12) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'verified', 'rejected', 'superseded')),
  rejection_reason  TEXT,
  document_key      VARCHAR(500),              -- private object store (same bucket as KYC documents)
  document_name     VARCHAR(255),
  document_mime     VARCHAR(100),
  document_size     INTEGER,
  verified_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  verified_at       TIMESTAMPTZ,
  last_alert_days   INTEGER,                   -- expiry alerts already sent (60/30/7/0), reset on renewal
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT party_licences_one_party CHECK (num_nonnulls(vendor_id, user_id) = 1),
  CONSTRAINT party_licences_other_named CHECK (form <> 'other' OR length(btrim(coalesce(form_name, ''))) >= 2),
  CONSTRAINT party_licences_dates CHECK (valid_from IS NULL OR valid_upto IS NULL OR valid_from <= valid_upto)
);
-- Who checked / entered a licence is also in the audit log; a removed staff login does not block
ALTER TABLE party_licences DROP CONSTRAINT IF EXISTS party_licences_verified_by_fkey;
ALTER TABLE party_licences ADD CONSTRAINT party_licences_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE party_licences DROP CONSTRAINT IF EXISTS party_licences_created_by_fkey;
ALTER TABLE party_licences ADD CONSTRAINT party_licences_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- One checked and at most one waiting licence of each form per party
CREATE UNIQUE INDEX IF NOT EXISTS uq_party_licences_vendor_verified
  ON party_licences (vendor_id, form, upper(coalesce(form_name, ''))) WHERE vendor_id IS NOT NULL AND status = 'verified';
CREATE UNIQUE INDEX IF NOT EXISTS uq_party_licences_vendor_pending
  ON party_licences (vendor_id, form, upper(coalesce(form_name, ''))) WHERE vendor_id IS NOT NULL AND status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_party_licences_user_verified
  ON party_licences (user_id, form, upper(coalesce(form_name, ''))) WHERE user_id IS NOT NULL AND status = 'verified';
CREATE UNIQUE INDEX IF NOT EXISTS uq_party_licences_user_pending
  ON party_licences (user_id, form, upper(coalesce(form_name, ''))) WHERE user_id IS NOT NULL AND status = 'pending';
CREATE INDEX IF NOT EXISTS idx_party_licences_vendor ON party_licences (vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_party_licences_user ON party_licences (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_party_licences_number ON party_licences (number_key);
CREATE INDEX IF NOT EXISTS idx_party_licences_expiry ON party_licences (valid_upto) WHERE status = 'verified';

-- ── Summary columns accept every form ────────────────────────────────────────
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_drug_license_type_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_drug_license_type_check CHECK (drug_license_type IN (
  'dl20', 'dl21', 'dl20a', 'dl21a', 'dl20b', 'dl21b', 'dl20c', 'dl20d', 'dl20f', 'dl20g',
  'dl25', 'dl25a', 'dl25b', 'dl28', 'dl28a', 'other', 'none'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_drug_license_type_check;
ALTER TABLE users ADD CONSTRAINT users_drug_license_type_check CHECK (drug_license_type IN (
  'dl20', 'dl21', 'dl20a', 'dl21a', 'dl20b', 'dl21b', 'dl20c', 'dl20d', 'dl20f', 'dl20g',
  'dl25', 'dl25a', 'dl25b', 'dl28', 'dl28a', 'other', 'none'));

-- ── 2. Sprint 28 partner licences move in; vendor_licences becomes a view ────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE c.relname = 'vendor_licences' AND c.relkind = 'r' AND n.nspname = current_schema()) THEN
    INSERT INTO party_licences (vendor_id, form, licence_number, issued_by, valid_upto, status, verified_by, verified_at,
                                last_alert_days, created_by, created_at, updated_at)
    SELECT vl.vendor_id, vl.licence_type, vl.licence_number, vl.issued_by, vl.valid_upto, 'verified', vl.created_by, vl.created_at,
           vl.last_alert_days, vl.created_by, vl.created_at, vl.updated_at
    FROM vendor_licences vl
    WHERE NOT EXISTS (SELECT 1 FROM party_licences p WHERE p.vendor_id = vl.vendor_id AND p.form = vl.licence_type
                        AND p.status = 'verified');
    DROP TABLE vendor_licences;
  END IF;
END $$;
CREATE OR REPLACE VIEW vendor_licences AS
  SELECT id, vendor_id, form AS licence_type, licence_number, valid_upto, issued_by, last_alert_days,
         created_by, created_at, updated_at
  FROM party_licences WHERE vendor_id IS NOT NULL AND status = 'verified';

-- ── 3. Single licences already on file ───────────────────────────────────────
-- Vendors (suppliers, partners) without a register row: their one licence
INSERT INTO party_licences (vendor_id, form, form_name, licence_number, valid_upto, status, verified_by, verified_at, created_at)
SELECT v.id,
       CASE WHEN v.drug_license_type IN ('dl20', 'dl21', 'dl20b', 'dl21b') THEN v.drug_license_type ELSE 'other' END,
       CASE WHEN v.drug_license_type IN ('dl20', 'dl21', 'dl20b', 'dl21b') THEN NULL ELSE 'Drug licence (form not recorded)' END,
       v.drug_license_no, v.drug_license_expiry,
       CASE WHEN COALESCE(v.drug_license_verified, FALSE) OR v.approval_status = 'approved' THEN 'verified' ELSE 'pending' END,
       v.approved_by, v.approved_at, v.created_at
FROM vendors v
WHERE NULLIF(btrim(v.drug_license_no), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM party_licences p WHERE p.vendor_id = v.id);

-- Buyer accounts: the licence given at sign-up / checked in KYC
INSERT INTO party_licences (user_id, form, form_name, licence_number, valid_upto, status, verified_by, verified_at, created_at)
SELECT u.id,
       CASE WHEN u.drug_license_type IN ('dl20', 'dl21', 'dl20b', 'dl21b') THEN u.drug_license_type ELSE 'other' END,
       CASE WHEN u.drug_license_type IN ('dl20', 'dl21', 'dl20b', 'dl21b') THEN NULL ELSE 'Drug licence (form not recorded)' END,
       u.drug_license_number, u.drug_license_expiry,
       CASE WHEN COALESCE(u.drug_license_verified, FALSE) THEN 'verified' ELSE 'pending' END,
       kv.verified_by_admin_id, CASE WHEN COALESCE(u.drug_license_verified, FALSE) THEN COALESCE(kv.verified_at, u.updated_at) END,
       u.created_at
FROM users u
LEFT JOIN kyc_verifications kv ON kv.user_id = u.id AND kv.document_type = 'drug_license_' || u.drug_license_type
WHERE NULLIF(btrim(u.drug_license_number), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM party_licences p WHERE p.user_id = u.id);

-- The original pharmacy profile table (not used by the API, copied so nothing is lost)
INSERT INTO party_licences (user_id, form, form_name, licence_number, status, created_at)
SELECT pp.user_id, 'other', 'Pharmacy profile licence', pp.drug_license_no,
       CASE WHEN pp.is_verified THEN 'verified' ELSE 'pending' END, pp.created_at
FROM pharmacy_profiles pp
WHERE NULLIF(btrim(pp.drug_license_no), '') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM party_licences p WHERE p.user_id = pp.user_id);

-- ── 4. Derived summary on vendors / users ────────────────────────────────────
-- Number and form: the first CHECKED form in this order; expiry: the earliest
-- valid-till of the checked licences. A pending renewal changes nothing until verified.
CREATE OR REPLACE FUNCTION licence_form_rank(f VARCHAR) RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(array_position(ARRAY['dl20', 'dl21', 'dl20b', 'dl21b', 'dl25', 'dl28', 'dl25a', 'dl28a', 'dl25b',
                                       'dl20a', 'dl21a', 'dl20c', 'dl20d', 'dl20f', 'dl20g', 'other']::varchar[], f), 99)
$$;

CREATE OR REPLACE FUNCTION refresh_licence_summary(p_vendor UUID, p_user UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  first_row RECORD;
  earliest DATE;
  checked INTEGER;
BEGIN
  SELECT form, licence_number INTO first_row FROM party_licences
  WHERE status = 'verified' AND ((p_vendor IS NOT NULL AND vendor_id = p_vendor) OR (p_user IS NOT NULL AND user_id = p_user))
  ORDER BY licence_form_rank(form), created_at LIMIT 1;
  SELECT MIN(valid_upto), COUNT(*) INTO earliest, checked FROM party_licences
  WHERE status = 'verified' AND ((p_vendor IS NOT NULL AND vendor_id = p_vendor) OR (p_user IS NOT NULL AND user_id = p_user));

  IF p_vendor IS NOT NULL AND checked > 0 THEN
    UPDATE vendors SET drug_license_no = first_row.licence_number, drug_license_type = first_row.form,
                       drug_license_expiry = earliest, drug_license_verified = TRUE, updated_at = NOW()
    WHERE id = p_vendor AND (drug_license_no, drug_license_type, drug_license_expiry, drug_license_verified)
          IS DISTINCT FROM (first_row.licence_number, first_row.form, earliest, TRUE);
  END IF;
  IF p_user IS NOT NULL THEN
    IF checked > 0 THEN
      UPDATE users SET drug_license_number = first_row.licence_number, drug_license_type = first_row.form,
                       drug_license_expiry = earliest, drug_license_verified = TRUE, updated_at = NOW()
      WHERE id = p_user AND (drug_license_number, drug_license_type, drug_license_expiry, drug_license_verified)
            IS DISTINCT FROM (first_row.licence_number, first_row.form, earliest, TRUE);
    ELSE
      -- Nothing checked yet: the admin queue shows the first licence given, not yet verified
      SELECT form, licence_number INTO first_row FROM party_licences
      WHERE user_id = p_user AND status = 'pending' ORDER BY licence_form_rank(form), created_at LIMIT 1;
      IF FOUND THEN
        UPDATE users SET drug_license_number = first_row.licence_number, drug_license_type = first_row.form,
                         drug_license_expiry = NULL, drug_license_verified = FALSE, updated_at = NOW()
        WHERE id = p_user;
      END IF;
    END IF;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION party_licences_summary_trigger() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM refresh_licence_summary(OLD.vendor_id, OLD.user_id); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN PERFORM refresh_licence_summary(NEW.vendor_id, NEW.user_id); END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS party_licences_summary ON party_licences;
CREATE TRIGGER party_licences_summary AFTER INSERT OR UPDATE OR DELETE ON party_licences
  FOR EACH ROW EXECUTE FUNCTION party_licences_summary_trigger();

-- ── 5. Dawabag's own drug licences: the register is the authority ────────────
ALTER TABLE business_licences DROP CONSTRAINT IF EXISTS business_licences_licence_type_check;
ALTER TABLE business_licences ADD CONSTRAINT business_licences_licence_type_check CHECK (licence_type IN (
  'retail_20', 'retail_21', 'wholesale_20b', 'wholesale_21b', 'restricted_20a', 'restricted_21a',
  'schedule_x_20f', 'schedule_x_20g', 'gst', 'shop_establishment', 'fssai', 'trade', 'other'));
DO $$
DECLARE s JSONB; upto DATE;
BEGIN
  SELECT value INTO s FROM app_settings WHERE key = 'legal.drug_licences';
  IF s IS NOT NULL THEN
    upto := CASE WHEN COALESCE(s->>'valid_upto', '') ~ '^\d{4}-\d{2}-\d{2}$' THEN (s->>'valid_upto')::date END;
    INSERT INTO business_licences (licence_type, licence_number, valid_upto, renewal_owner, notes)
    SELECT t.licence_type, btrim(s->>t.k), upto, 'Not recorded — set the renewal owner',
           'Copied from the old website footer setting (Sprint 30)'
    FROM (VALUES ('retail_20', 'retail_20'), ('retail_21', 'retail_21'),
                 ('wholesale_20b', 'wholesale_20b'), ('wholesale_21b', 'wholesale_21b')) AS t(licence_type, k)
    WHERE COALESCE(btrim(s->>t.k), '') <> ''
    ON CONFLICT (licence_type, licence_number) DO NOTHING;
    DELETE FROM app_settings WHERE key = 'legal.drug_licences';
  END IF;
END $$;

-- ── 6. Licences as on the day of sale (C-13) ─────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_drug_licences JSONB;           -- [{form, label, number, valid_upto}]
ALTER TABLE order_shipments ADD COLUMN IF NOT EXISTS seller_drug_licences JSONB; -- same shape

-- Goods receipts record every licence of the supplier as checked at receipt (C-02)
ALTER TABLE goods_receipts ALTER COLUMN supplier_dl_no TYPE VARCHAR(600);
