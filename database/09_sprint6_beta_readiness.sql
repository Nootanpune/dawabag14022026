-- ─────────────────────────────────────────────────────────────────────────────
-- 09_sprint6_beta_readiness.sql — Sprint 6 (beta launch readiness)
-- Applied by the migration runner (backend/src/db/migrate.ts). Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Coupons: one row per use, and an optional per-buyer limit ────────────────
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS per_user_limit INTEGER CHECK (per_user_limit IS NULL OR per_user_limit > 0);
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  coupon_id   UUID NOT NULL REFERENCES coupons(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (coupon_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions(coupon_id, user_id);

-- ── Statutory records are final (Rulebook C-34, C-09, C-30, C-46) ────────────
-- No UPDATE or DELETE on the H1 register, credit notes, the audit log and the
-- consent log; invoice amounts and lines cannot change once issued. Only a
-- maintenance session that runs  SET LOCAL dawabag.maintenance = 'on'  (data
-- retention purges after the legal period, test clean-up) may bypass this.
CREATE OR REPLACE FUNCTION dawabag_records_are_final() RETURNS trigger AS $$
BEGIN
  IF current_setting('dawabag.maintenance', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION '% on % is not allowed: statutory records are final', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['h1_register', 'credit_notes', 'credit_note_items', 'audit_logs', 'consent_records'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_final ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_final BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION dawabag_records_are_final()', t, t);
  END LOOP;
END $$;

-- Invoice values: status, courier and handover fields may change; amounts may not.
-- (One function per table: PL/pgSQL resolves every NEW.field it mentions.)
CREATE OR REPLACE FUNCTION dawabag_shipment_amounts_final() RETURNS trigger AS $$
BEGIN
  IF current_setting('dawabag.maintenance', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Invoice % cannot be deleted: invoices are final', OLD.invoice_number USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.invoice_number, NEW.subtotal_paise, NEW.gst_paise, NEW.total_paise, NEW.seller_type, NEW.partner_id)
     IS DISTINCT FROM (OLD.invoice_number, OLD.subtotal_paise, OLD.gst_paise, OLD.total_paise, OLD.seller_type, OLD.partner_id) THEN
    RAISE EXCEPTION 'Invoice % amounts are final; issue a credit note instead', OLD.invoice_number USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION dawabag_line_amounts_final() RETURNS trigger AS $$
BEGIN
  IF current_setting('dawabag.maintenance', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Invoiced lines cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.product_id, NEW.quantity, NEW.unit_price_paise, NEW.mrp_paise, NEW.gst_rate, NEW.cgst_paise, NEW.sgst_paise,
      NEW.igst_paise, NEW.line_total_paise, NEW.shipment_id, NEW.batch_id)
     IS DISTINCT FROM (OLD.product_id, OLD.quantity, OLD.unit_price_paise, OLD.mrp_paise, OLD.gst_rate, OLD.cgst_paise, OLD.sgst_paise,
      OLD.igst_paise, OLD.line_total_paise, OLD.shipment_id, OLD.batch_id) THEN
    RAISE EXCEPTION 'Invoiced lines are final; issue a credit note instead' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS dawabag_invoice_amounts_final() CASCADE;
DROP TRIGGER IF EXISTS order_shipments_amounts_final ON order_shipments;
CREATE TRIGGER order_shipments_amounts_final BEFORE UPDATE OR DELETE ON order_shipments
  FOR EACH ROW EXECUTE FUNCTION dawabag_shipment_amounts_final();
DROP TRIGGER IF EXISTS order_items_amounts_final ON order_items;
CREATE TRIGGER order_items_amounts_final BEFORE UPDATE OR DELETE ON order_items
  FOR EACH ROW WHEN (OLD.shipment_id IS NOT NULL)
  EXECUTE FUNCTION dawabag_line_amounts_final();

-- ── Saved prescription offered for an order (C-08) ───────────────────────────
-- The buyer points an order at a verified prescription; a pharmacist still decides.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS requested_prescription_id UUID REFERENCES prescriptions(id);

-- ── Cold-chain dispatch record (C-25) ────────────────────────────────────────
ALTER TABLE order_shipments
  ADD COLUMN IF NOT EXISTS cold_chain_temp_c     NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS cold_chain_logger_id  VARCHAR(60);

-- ── Security incident register (C-43): CERT-In within 6 hours ────────────────
CREATE SEQUENCE IF NOT EXISTS security_incident_seq;
CREATE TABLE IF NOT EXISTS security_incidents (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_no            VARCHAR(20) NOT NULL UNIQUE,
  title                  VARCHAR(200) NOT NULL,
  category               VARCHAR(30) NOT NULL CHECK (category IN (
                           'data_breach', 'unauthorised_access', 'malware', 'phishing', 'service_outage',
                           'payment_fraud', 'lost_device', 'other')),
  severity               VARCHAR(10) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description            TEXT NOT NULL,
  personal_data_affected BOOLEAN NOT NULL DEFAULT FALSE,
  detected_at            TIMESTAMPTZ NOT NULL,
  status                 VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'contained', 'closed')),
  cert_in_reported_at    TIMESTAMPTZ,
  cert_in_reference      VARCHAR(100),
  dpb_notified_at        TIMESTAMPTZ,      -- Data Protection Board
  users_notified_at      TIMESTAMPTZ,
  actions_taken          TEXT,
  reported_by            UUID NOT NULL REFERENCES users(id),
  closed_at              TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
