-- ─────────────────────────────────────────────────────────────────────────────
-- 15_sprint12_language_retention.sql — Sprint 12 (hardening)
-- Applied by the migration runner. Safe to re-run.
--
-- 1. Policies in Marathi and Hindi (DPDP Act s.5(3): the notice in English or a
--    language of the Eighth Schedule; C-40). The English text is the master; a
--    translation carries the same version number as the English text it renders.
-- 2. Consent records which language the notice was shown in.
-- 3. Retention periods for operational data (DPDP storage limitation; C-44).
--    Statutory records (invoices, H1, credit notes, audit, consent, e-invoices,
--    e-prescriptions, GRNs) are never purged by the job.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE policy_documents ADD COLUMN IF NOT EXISTS language VARCHAR(5) NOT NULL DEFAULT 'en';
DO $$ BEGIN
  ALTER TABLE policy_documents ADD CONSTRAINT policy_documents_language_check CHECK (language IN ('en', 'mr', 'hi'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE policy_documents DROP CONSTRAINT IF EXISTS policy_documents_doc_key_version_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_doc_lang_version ON policy_documents(doc_key, language, version);

ALTER TABLE consent_records ADD COLUMN IF NOT EXISTS notice_language VARCHAR(5);

INSERT INTO app_settings (key, value, description) VALUES
  ('retention.days', '{"notification_deliveries": 365, "notifications": 365, "payment_webhook_events": 730, "job_runs": 365, "abandoned_carts": 90, "stale_devices": 180}',
   'Days operational data is kept before the retention_purge job deletes it (DPDP storage limitation, C-44). Statutory records are never purged')
ON CONFLICT (key) DO NOTHING;

-- ── 4. Security review fixes ─────────────────────────────────────────────────
-- Consultation fee refunds are tracked until the gateway confirms them (C-37):
-- 'refund_pending' is set in the cancelling transaction; the sweep retries.
ALTER TABLE consultations ALTER COLUMN payment_status TYPE VARCHAR(16);
ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_payment_status_check;
ALTER TABLE consultations ADD CONSTRAINT consultations_payment_status_check
  CHECK (payment_status IN ('unpaid', 'paid', 'waived', 'refund_pending', 'refunded'));
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS refund_error TEXT;

-- A schedule change clears the telemedicine list: a pharmacist classifies it again (C-23)
CREATE OR REPLACE FUNCTION dawabag_telemedicine_prohibited() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.drug_schedule IS DISTINCT FROM OLD.drug_schedule
     AND NEW.telemedicine_list IS NOT DISTINCT FROM OLD.telemedicine_list THEN
    NEW.telemedicine_list := NULL;
  END IF;
  IF NEW.drug_schedule IN ('Schedule X', 'NDPS') THEN NEW.telemedicine_list := 'prohibited';
  ELSIF NEW.telemedicine_list IS NULL AND NEW.drug_schedule = 'OTC' THEN NEW.telemedicine_list := 'O';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Stock never below what orders hold; two people for counts and purchase orders (C-46)
DO $$ BEGIN
  ALTER TABLE inventory_batches ADD CONSTRAINT inventory_batches_reserved_check
    CHECK (quantity_reserved >= 0 AND quantity_available >= quantity_reserved);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE stock_counts ADD CONSTRAINT stock_counts_two_person CHECK (approved_by IS NULL OR approved_by <> counted_by);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_two_person CHECK (approved_by IS NULL OR approved_by <> raised_by);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A decided stock adjustment is final; only the destruction record may be added (C-34)
CREATE OR REPLACE FUNCTION dawabag_adjustment_final() RETURNS trigger AS $$
BEGIN
  IF current_setting('dawabag.maintenance', true) = 'on' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'requested' THEN RAISE EXCEPTION 'A decided stock adjustment cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'requested' AND (NEW.status, NEW.batch_id, NEW.quantity_delta, NEW.reason, NEW.notes, NEW.requested_by, NEW.approved_by, NEW.decided_at)
       IS DISTINCT FROM (OLD.status, OLD.batch_id, OLD.quantity_delta, OLD.reason, OLD.notes, OLD.requested_by, OLD.approved_by, OLD.decided_at) THEN
    RAISE EXCEPTION 'A decided stock adjustment is final';
  END IF;
  IF OLD.disposed_at IS NOT NULL AND (NEW.disposal_method, NEW.disposal_reference, NEW.disposal_witness, NEW.disposed_at)
       IS DISTINCT FROM (OLD.disposal_method, OLD.disposal_reference, OLD.disposal_witness, OLD.disposed_at) THEN
    RAISE EXCEPTION 'A recorded destruction is final';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS stock_adjustments_final ON stock_adjustments;
CREATE TRIGGER stock_adjustments_final BEFORE UPDATE OR DELETE ON stock_adjustments FOR EACH ROW EXECUTE FUNCTION dawabag_adjustment_final();

INSERT INTO app_settings (key, value, description) VALUES
  ('catalogue.opening_stock_open', 'true',
   'Catalogue import may add opening stock. Switch off at go-live: from then on stock enters only by goods receipt (C-46)')
ON CONFLICT (key) DO NOTHING;
