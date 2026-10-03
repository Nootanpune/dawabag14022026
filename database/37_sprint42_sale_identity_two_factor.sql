-- ─────────────────────────────────────────────────────────────────────────────
-- 37_sprint42_sale_identity_two_factor.sql — Sprint 42
-- Applied by the migration runner (backend/src/db/migrate.ts) as the database owner.
-- Safe to re-run (IF NOT EXISTS, backfill only where still empty, triggers re-created).
--
--  1. Frozen sale identity per shipment (handover D15 / gap analysis §5.1 #7; C-05,
--     C-07, C-08, C-13, C-33, C-46). A marketplace order is split into one shipment
--     per seller of record, so the identity of each SALE is kept on its shipment:
--       * seller (seller_type / partner_id — frozen since Sprint 6),
--       * the seller's licences as on the day of sale (seller_drug_licences, Sprint 30)
--         and the ones actually used by this shipment's lines (sale_licences),
--       * the sale channel (retail = Form 20/21; wholesale = Form 20B/21B) and the
--         buyer's type that decided it,
--       * a licensed trade buyer's licences as on the day of sale (buyer_drug_licences),
--       * per line: the ONE licence form (and number) it is sold under and the price
--         field used (order_items.sale_licence_form / sale_licence_number / price_field),
--       * the pharmacist of record — filled once by the release or refusal, with a
--         snapshot of their registration (pharmacist_registration), then final.
--     The moment of sale is ORDER PLACEMENT: the same transaction that fixes the
--     seller of record, reserves the stock, takes the seller's gap-free invoice number
--     and the invoice amounts (already final since Sprint 6). From then on the
--     trigger below refuses any change; only the maintenance role may bypass it
--     (dawabag_maintenance_active(), Sprint 38).
--     Existing shipments are filled from the data held now and marked
--     sale_identity_source = 'backfill' (not 'sale').
--  2. Two-step sign-in (TOTP authenticator app) for staff and partner logins:
--     user_two_factor (secret encrypted by the API; never readable here), hashed
--     one-time recovery codes, and the super-admin setting security.two_factor
--     ('optional' until the owner decides; 'required' forces enrolment). C-41, C-43, C-46.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Sale identity: columns ────────────────────────────────────────────────
ALTER TABLE order_shipments
  ADD COLUMN IF NOT EXISTS sale_channel            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sale_buyer_type         VARCHAR(20),
  ADD COLUMN IF NOT EXISTS sale_licences           JSONB,
  ADD COLUMN IF NOT EXISTS buyer_drug_licences     JSONB,
  ADD COLUMN IF NOT EXISTS pharmacist_registration JSONB,
  ADD COLUMN IF NOT EXISTS sale_identity_frozen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sale_identity_source    VARCHAR(10);

ALTER TABLE order_shipments DROP CONSTRAINT IF EXISTS order_shipments_sale_identity_check;
ALTER TABLE order_shipments ADD CONSTRAINT order_shipments_sale_identity_check CHECK (
  (sale_channel IS NULL OR sale_channel IN ('retail', 'wholesale'))
  AND (sale_identity_source IS NULL OR sale_identity_source IN ('sale', 'backfill'))
  -- a frozen identity is complete
  AND (sale_identity_frozen_at IS NULL
       OR (sale_channel IS NOT NULL AND sale_identity_source IS NOT NULL AND seller_drug_licences IS NOT NULL AND sale_licences IS NOT NULL))
);

COMMENT ON COLUMN order_shipments.sale_channel IS
  'Sprint 42: retail (Form 20/21, consumers) or wholesale (Form 20B/21B, licensed trade buyers and doctors) — frozen at the sale (C-07, C-33)';
COMMENT ON COLUMN order_shipments.sale_buyer_type IS
  'Sprint 42: the buyer''s price type at the sale (customer | b2b_retailer | b2b_wholesaler | doc_hospital) that decided the channel';
COMMENT ON COLUMN order_shipments.sale_licences IS
  'Sprint 42: the seller''s licences this shipment''s lines were sold under, [{form,label,number,valid_upto}] as on the day of sale (C-13)';
COMMENT ON COLUMN order_shipments.buyer_drug_licences IS
  'Sprint 42: a licensed trade buyer''s checked licences as on the day of sale (copy of orders.buyer_drug_licences, C-11, C-13)';
COMMENT ON COLUMN order_shipments.pharmacist_registration IS
  'Sprint 42: the releasing / refusing pharmacist''s registration as at the check (number, council, valid till, status) — filled once (C-03, C-08)';
COMMENT ON COLUMN order_shipments.sale_identity_source IS
  'Sprint 42: sale = recorded at order placement; backfill = filled by migration 37 from the data held then';

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS sale_licence_form   VARCHAR(10),
  ADD COLUMN IF NOT EXISTS sale_licence_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS price_field         VARCHAR(15);
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_sale_identity_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_sale_identity_check CHECK (
  (sale_licence_form IS NULL OR sale_licence_form IN ('dl20', 'dl21', 'dl20b', 'dl21b'))
  AND (price_field IS NULL OR price_field IN ('offer', 'ptr', 'pts', 'institutional'))
);
COMMENT ON COLUMN order_items.sale_licence_form IS
  'Sprint 42: the one licence form this line is sold under — dl20 / dl21 (retail; 21 = Schedule C/C1) or dl20b / dl21b (wholesale) (sellingRights.ts, C-33)';

-- ── 2. Backfill (existing shipments, from the data held now) ─────────────────
-- The triggers are re-created at the end of this file; dropped first so a re-run can fill.
DROP TRIGGER IF EXISTS order_shipments_identity_final ON order_shipments;
DROP TRIGGER IF EXISTS order_items_sale_identity_final ON order_items;
DROP TRIGGER IF EXISTS orders_buyer_licences_final ON orders;

-- a) The seller's licences where the shipment has no snapshot yet (orders before Sprint 30):
--    the partner's checked licences, or Dawabag's register, as held now
UPDATE order_shipments s SET seller_drug_licences = x.snap
FROM (
  SELECT s2.id,
         COALESCE(jsonb_agg(jsonb_build_object('form', l.form, 'label', l.label, 'number', l.number, 'valid_upto', l.valid_upto)
                            ORDER BY l.ord, l.number) FILTER (WHERE l.form IS NOT NULL), '[]'::jsonb) AS snap
  FROM order_shipments s2
  LEFT JOIN LATERAL (
    SELECT pl.form,
           CASE WHEN pl.form = 'other' THEN COALESCE(pl.form_name, 'Other licence') ELSE 'Form ' || upper(substr(pl.form, 3)) END AS label,
           pl.licence_number AS number, to_char(pl.valid_upto, 'YYYY-MM-DD') AS valid_upto,
           array_position(ARRAY['dl20','dl21','dl20b','dl21b','dl25','dl28','dl25a','dl28a','dl25b','dl20a','dl21a','dl20c','dl20d','dl20f','dl20g','other'], pl.form::text) AS ord
    FROM party_licences pl
    WHERE s2.seller_type = 'partner' AND pl.vendor_id = s2.partner_id AND pl.status = 'verified'
    UNION ALL
    SELECT m.form, 'Form ' || upper(substr(m.form, 3)), bl.licence_number, to_char(bl.valid_upto, 'YYYY-MM-DD'),
           array_position(ARRAY['dl20','dl21','dl20b','dl21b'], m.form)
    FROM business_licences bl
    JOIN (VALUES ('retail_20', 'dl20'), ('retail_21', 'dl21'), ('wholesale_20b', 'dl20b'), ('wholesale_21b', 'dl21b')) AS m(t, form)
      ON m.t = bl.licence_type
    WHERE s2.seller_type = 'dawabag' AND bl.is_active
  ) l ON TRUE
  WHERE s2.seller_drug_licences IS NULL
  GROUP BY s2.id
) x
WHERE x.id = s.id AND s.seller_drug_licences IS NULL;

-- b) Channel and buyer type: a KYC-approved trade account bought by way of wholesale (the
--    price type at the time is not stored; this is the best evidence held now)
UPDATE order_shipments s
   SET sale_buyer_type = CASE WHEN u.customer_type IN ('b2b_retailer', 'b2b_wholesaler', 'doc_hospital') AND u.kyc_status = 'approved'
                              THEN u.customer_type ELSE 'customer' END,
       sale_channel = CASE WHEN u.customer_type IN ('b2b_retailer', 'b2b_wholesaler', 'doc_hospital') AND u.kyc_status = 'approved'
                           THEN 'wholesale' ELSE 'retail' END,
       buyer_drug_licences = o.buyer_drug_licences
  FROM orders o JOIN users u ON u.id = o.user_id
 WHERE o.id = s.order_id AND s.sale_channel IS NULL;

-- c) Each line: the form the channel and the medicine need (Schedule C / C1 → 21 / 21B), the
--    seller's licence of that form from the shipment's snapshot, and the price field
UPDATE order_items oi
   SET sale_licence_form = CASE WHEN s.sale_channel = 'wholesale'
                                THEN CASE WHEN p.schedule_c_c1 THEN 'dl21b' ELSE 'dl20b' END
                                ELSE CASE WHEN p.schedule_c_c1 THEN 'dl21' ELSE 'dl20' END END,
       price_field = CASE s.sale_buyer_type WHEN 'b2b_retailer' THEN 'ptr' WHEN 'b2b_wholesaler' THEN 'pts'
                                            WHEN 'doc_hospital' THEN 'institutional' ELSE 'offer' END
  FROM order_shipments s, products p
 WHERE oi.shipment_id = s.id AND p.id = oi.product_id AND oi.sale_licence_form IS NULL;

UPDATE order_items oi
   SET sale_licence_number = (
     SELECT e->>'number' FROM order_shipments s, jsonb_array_elements(s.seller_drug_licences) e
      WHERE s.id = oi.shipment_id AND e->>'form' = oi.sale_licence_form
      ORDER BY (e->>'valid_upto') DESC NULLS FIRST LIMIT 1)
 WHERE oi.shipment_id IS NOT NULL AND oi.sale_licence_form IS NOT NULL AND oi.sale_licence_number IS NULL;

-- d) The licences actually used by the shipment's lines
UPDATE order_shipments s
   SET sale_licences = COALESCE((
     SELECT jsonb_agg(DISTINCT e) FROM jsonb_array_elements(s.seller_drug_licences) e
      WHERE EXISTS (SELECT 1 FROM order_items oi WHERE oi.shipment_id = s.id
                       AND oi.sale_licence_form = e->>'form' AND oi.sale_licence_number = e->>'number')), '[]'::jsonb)
 WHERE s.sale_licences IS NULL;

-- e) The pharmacist's registration where a release or refusal named one (as recorded now)
UPDATE order_shipments s
   SET pharmacist_registration = jsonb_build_object(
         'kind', 'partner', 'registration_no', s.pharmacist_reg_no, 'state_council', vp.state_council,
         'valid_till', to_char(vp.valid_till, 'YYYY-MM-DD'), 'status', vp.registration_status,
         'verified', vp.verified_at IS NOT NULL, 'recorded', 'backfill')
  FROM vendor_pharmacists vp
 WHERE vp.id = s.vendor_pharmacist_id AND s.pharmacist_registration IS NULL
   AND s.pharmacist_check IN ('released', 'rejected') AND s.pharmacist_reg_no IS NOT NULL;
UPDATE order_shipments s
   SET pharmacist_registration = jsonb_build_object(
         'kind', 'staff', 'registration_no', s.pharmacist_reg_no, 'state_council', pr.state_council,
         'valid_till', to_char(pr.valid_till, 'YYYY-MM-DD'), 'status', pr.status,
         'verified', pr.verified_at IS NOT NULL, 'recorded', 'backfill')
  FROM pharmacist_registrations pr
 WHERE pr.user_id = s.pharmacist_checked_by AND s.vendor_pharmacist_id IS NULL AND s.pharmacist_registration IS NULL
   AND s.pharmacist_check IN ('released', 'rejected') AND s.pharmacist_reg_no IS NOT NULL;
UPDATE order_shipments s
   SET pharmacist_registration = jsonb_build_object('kind', CASE WHEN s.vendor_pharmacist_id IS NULL THEN 'staff' ELSE 'partner' END,
         'registration_no', s.pharmacist_reg_no, 'recorded', 'backfill')
 WHERE s.pharmacist_registration IS NULL AND s.pharmacist_check IN ('released', 'rejected') AND s.pharmacist_reg_no IS NOT NULL;

-- f) Mark every remaining shipment's identity as filled by this backfill, and freeze it
UPDATE order_shipments
   SET sale_identity_frozen_at = NOW(), sale_identity_source = 'backfill'
 WHERE sale_identity_frozen_at IS NULL AND sale_channel IS NOT NULL AND seller_drug_licences IS NOT NULL AND sale_licences IS NOT NULL;

-- ── 3. The freeze (C-46): refused for everyone but the maintenance role ──────
-- Shipment: the sale identity cannot change once frozen; the pharmacist of record is
-- written by the release / refusal and is then final (a hold may be overwritten by the
-- later decision); the registration snapshot is filled once.
CREATE OR REPLACE FUNCTION dawabag_shipment_identity_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN NEW; END IF;
  IF OLD.sale_identity_frozen_at IS NOT NULL
     AND (NEW.sale_channel, NEW.sale_buyer_type, NEW.seller_drug_licences, NEW.sale_licences, NEW.buyer_drug_licences,
          NEW.sale_identity_frozen_at, NEW.sale_identity_source)
         IS DISTINCT FROM
         (OLD.sale_channel, OLD.sale_buyer_type, OLD.seller_drug_licences, OLD.sale_licences, OLD.buyer_drug_licences,
          OLD.sale_identity_frozen_at, OLD.sale_identity_source) THEN
    RAISE EXCEPTION 'Invoice %: the sale record (seller licences, sale channel, buyer licences) was fixed at the sale and cannot be changed', OLD.invoice_number
      USING ERRCODE = 'P0001';
  END IF;
  IF OLD.pharmacist_check IN ('released', 'rejected', 'not_recorded')
     AND (NEW.pharmacist_check, NEW.pharmacist_checked_by, NEW.pharmacist_checked_at, NEW.pharmacist_name, NEW.pharmacist_reg_no,
          NEW.vendor_pharmacist_id, NEW.pharmacist_check_note, NEW.pharmacist_registration)
         IS DISTINCT FROM
         (OLD.pharmacist_check, OLD.pharmacist_checked_by, OLD.pharmacist_checked_at, OLD.pharmacist_name, OLD.pharmacist_reg_no,
          OLD.vendor_pharmacist_id, OLD.pharmacist_check_note, OLD.pharmacist_registration) THEN
    RAISE EXCEPTION 'Invoice %: the pharmacist''s check is recorded and cannot be changed', OLD.invoice_number USING ERRCODE = 'P0001';
  END IF;
  IF OLD.pharmacist_registration IS NOT NULL AND NEW.pharmacist_registration IS DISTINCT FROM OLD.pharmacist_registration THEN
    RAISE EXCEPTION 'Invoice %: the pharmacist''s registration was recorded at the check and cannot be changed', OLD.invoice_number USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER order_shipments_identity_final BEFORE UPDATE ON order_shipments
  FOR EACH ROW EXECUTE FUNCTION dawabag_shipment_identity_final();

-- Line: the licence form / number and price field, once written
CREATE OR REPLACE FUNCTION dawabag_line_sale_identity_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN NEW; END IF;
  IF (NEW.sale_licence_form, NEW.sale_licence_number, NEW.price_field)
     IS DISTINCT FROM (OLD.sale_licence_form, OLD.sale_licence_number, OLD.price_field) THEN
    RAISE EXCEPTION 'The licence a line was sold under is fixed at the sale and cannot be changed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER order_items_sale_identity_final BEFORE UPDATE ON order_items
  FOR EACH ROW WHEN (OLD.sale_licence_form IS NOT NULL)
  EXECUTE FUNCTION dawabag_line_sale_identity_final();

-- Order: a trade buyer's licence snapshot, once written
CREATE OR REPLACE FUNCTION dawabag_order_buyer_licences_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN NEW; END IF;
  IF NEW.buyer_drug_licences IS DISTINCT FROM OLD.buyer_drug_licences THEN
    RAISE EXCEPTION 'Order %: the buyer''s licences as on the day of sale cannot be changed', OLD.order_number USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER orders_buyer_licences_final BEFORE UPDATE ON orders
  FOR EACH ROW WHEN (OLD.buyer_drug_licences IS NOT NULL)
  EXECUTE FUNCTION dawabag_order_buyer_licences_final();

-- ── 4. Two-step sign-in (authenticator app) ──────────────────────────────────
-- One row per login that has started enrolment. secret_enc is AES-256-GCM ciphertext
-- made by the API with TOTP_ENC_KEY (bound to the user id); the database never holds the
-- secret in clear. last_used_step: the newest 30-second step accepted — a code is used once.
CREATE TABLE IF NOT EXISTS user_two_factor (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_enc     TEXT NOT NULL,
  status         VARCHAR(10) NOT NULL CHECK (status IN ('pending', 'active')),
  last_used_step BIGINT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at   TIMESTAMPTZ,
  CHECK (status <> 'active' OR confirmed_at IS NOT NULL)
);
COMMENT ON TABLE user_two_factor IS
  'Sprint 42: authenticator-app (RFC 6238 TOTP) enrolment of staff and partner logins; secret encrypted by the API (C-41, C-43)';

-- Ten one-time recovery codes per enrolment, stored only as keyed hashes (HMAC-SHA-256)
CREATE TABLE IF NOT EXISTS user_recovery_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  CHAR(64) NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, code_hash)
);
CREATE INDEX IF NOT EXISTS idx_user_recovery_codes_user ON user_recovery_codes (user_id) WHERE used_at IS NULL;

INSERT INTO app_settings (key, value, description) VALUES
  ('security.two_factor', '"optional"',
   'Two-step sign-in (authenticator app) for admin, pharmacist, packer and partner logins: optional = each person may switch it on; required = they must set it up at their next sign-in. Owner decision pending. C-41, C-43')
ON CONFLICT (key) DO NOTHING;

-- ── 5. Privileges (Sprint 41: the API is a login in dawabag_app only) ────────
GRANT SELECT, INSERT, UPDATE, DELETE ON user_two_factor, user_recovery_codes TO dawabag_app, dawabag_maintenance;
