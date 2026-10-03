-- ─────────────────────────────────────────────────────────────────────────────
-- 33_sprint38_registers_integrity.sql — Sprint 38 (registers and integrity)
-- Applied by the migration runner (backend/src/db/migrate.ts). Safe to re-run.
--
--  1. The maintenance bypass needs a separate database role (C-34, C-46)
--  2. Schedule H1 register: complete entries, numbered without gaps per seller
--     licence, hash-chained (C-09, C-05)
--  3. Audit log hash chain (C-46)
--  4. Verified prescriptions are frozen; append-only dispense ledger; two clocks
--     (valid_until / retain_until) (C-08, C-34, C-44)
--  5. Emergency stop for prescription-medicine sales (owner, 2026-10-03; C-08)
--  6. No referral codes for doctor accounts (C-20)
--  7. Database roles: dawabag_app (what the API needs) and dawabag_maintenance
--
-- Needs to run as a role that may create roles (the migration user is a superuser
-- in every Dawabag environment: docker POSTGRES_USER, dev-up.sh). See RUNBOOK
-- "Database roles" for running the API as a non-owner login in production.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Maintenance bypass: role-checked ──────────────────────────────────────
-- Before Sprint 38 any session could run  SET LOCAL dawabag.maintenance = 'on'  and
-- then edit or delete final records — including the API's own login. From now on the
-- setting counts only while the session acts AS the NOLOGIN role dawabag_maintenance:
--   * a controlled SECURITY DEFINER function owned by it (dawabag_purge_prescriptions
--     below — the retention purge), or
--   * an operator / test clean-up session that may  SET ROLE dawabag_maintenance
--     (a superuser, or a login an operator granted the role to; the API's login is
--     never granted it).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dawabag_maintenance') THEN
    CREATE ROLE dawabag_maintenance NOLOGIN;
  END IF;
  -- What the API needs and nothing more (DML; no DDL, no ownership, no maintenance)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dawabag_app') THEN
    CREATE ROLE dawabag_app NOLOGIN;
  END IF;
END $$;

-- Privileges first (repeated at the end for objects this file creates)
GRANT USAGE ON SCHEMA public TO dawabag_app, dawabag_maintenance;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dawabag_app, dawabag_maintenance;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO dawabag_app, dawabag_maintenance;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dawabag_app, dawabag_maintenance;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO dawabag_app, dawabag_maintenance;

-- current_user: inside the controlled SECURITY DEFINER functions. The `role` setting:
-- a session that ran SET ROLE dawabag_maintenance — it stays set while PostgreSQL runs a
-- foreign-key cascade as the table owner, so a clean-up's cascaded deletes pass too.
-- Neither can be reached without membership of the role (SET ROLE / set_config('role')
-- both check it), and the API's login is never a member.
CREATE OR REPLACE FUNCTION dawabag_maintenance_active() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('dawabag.maintenance', true), '') = 'on'
     AND (current_user = 'dawabag_maintenance' OR current_setting('role', true) = 'dawabag_maintenance')
$$;

-- The finality functions of migrations 09, 12, 15 and 17, unchanged except for the bypass
CREATE OR REPLACE FUNCTION dawabag_records_are_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION '% on % is not allowed: statutory records are final', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION dawabag_shipment_amounts_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
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
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
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

CREATE OR REPLACE FUNCTION dawabag_einvoice_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'generated' OR OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'A registered e-invoice cannot be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('generated', 'cancelled') AND (
       NEW.irn IS DISTINCT FROM OLD.irn OR NEW.ack_no IS DISTINCT FROM OLD.ack_no OR NEW.ack_date IS DISTINCT FROM OLD.ack_date
    OR NEW.signed_qr IS DISTINCT FROM OLD.signed_qr OR NEW.signed_invoice IS DISTINCT FROM OLD.signed_invoice
    OR NEW.doc_number IS DISTINCT FROM OLD.doc_number OR (NEW.status <> OLD.status AND NOT (OLD.status = 'generated' AND NEW.status = 'cancelled'))) THEN
    RAISE EXCEPTION 'A registered e-invoice is final';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION dawabag_adjustment_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
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

CREATE OR REPLACE FUNCTION recall_alert_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Recall alert records cannot be deleted'; END IF;
  IF TG_TABLE_NAME = 'recall_alert_matches' THEN
    IF OLD.decision <> 'pending' THEN RAISE EXCEPTION 'This recall decision is final'; END IF;
    IF NEW.line_id <> OLD.line_id OR NEW.product_id <> OLD.product_id THEN
      RAISE EXCEPTION 'A recall match cannot be moved';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'recall_alerts' THEN
    IF ROW(NEW.alert_no, NEW.source, NEW.reference, NEW.received_at, NEW.due_at, NEW.entered_by, NEW.entered_at)
       IS DISTINCT FROM ROW(OLD.alert_no, OLD.source, OLD.reference, OLD.received_at, OLD.due_at, OLD.entered_by, OLD.entered_at) THEN
      RAISE EXCEPTION 'Recall alerts cannot be changed';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Recall alert lines cannot be changed';
END $$ LANGUAGE plpgsql;

-- ── Hash-chain building blocks (shared by the H1 register and the audit log) ──
-- Canonical text, one field per line, in a fixed order:
--   name=~                 the field is NULL (written explicitly, never skipped)
--   name=<bytes>:<value>   otherwise; <bytes> = UTF-8 length, so no value can be
--                          mistaken for a field boundary
-- Timestamps are UTC, ISO 8601, milliseconds (stored values are truncated to the
-- millisecond on insert), so the text never depends on the session time zone.
-- backend/src/utils/hashChain.ts builds exactly the same text; the verify endpoints
-- recompute every hash there, independently of these functions.
CREATE OR REPLACE FUNCTION dawabag_canon(p_name text, p_value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_value IS NULL THEN p_name || '=~'
              ELSE p_name || '=' || octet_length(p_value)::text || ':' || p_value END
$$;
CREATE OR REPLACE FUNCTION dawabag_canon_ts(p_ts timestamptz) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT to_char(p_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;
CREATE OR REPLACE FUNCTION dawabag_sha256_hex(p text) RETURNS char(64)
LANGUAGE sql IMMUTABLE AS $$ SELECT encode(sha256(convert_to(p, 'UTF8')), 'hex')::char(64) $$;

-- A chained table's rows may change only by the commit-time seal (prev_hash /
-- row_hash / number set once, from NULL, by the seal trigger itself), or in a
-- maintenance session (section 1).
CREATE OR REPLACE FUNCTION dawabag_chain_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'UPDATE' AND pg_trigger_depth() > 1 AND OLD.row_hash IS NULL AND NEW.row_hash IS NOT NULL
     AND (to_jsonb(NEW) - 'prev_hash' - 'row_hash' - 'entry_no' - 'chain_seq')
       = (to_jsonb(OLD) - 'prev_hash' - 'row_hash' - 'entry_no' - 'chain_seq') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% on % is not allowed: statutory records are final', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

-- ── 2. Schedule H1 register (C-09, C-05) ─────────────────────────────────────
-- Entries are numbered 1, 2, 3 … without gaps PER SELLER LICENCE — Dawabag's own
-- retail licence and each partner's — because the seller of record is the licensee
-- that keeps the register. register_key = 'dawabag:<LICENCE>' or
-- 'partner:<vendor id>:<LICENCE>' (licence number upper-cased, letters and digits).
-- The number, prev_hash and row_hash are set when the dispatch COMMITS, under an
-- advisory lock per register (seal trigger below): concurrent dispatches queue for
-- a moment at commit and can never fork the chain or skip a number, and a rolled-
-- back dispatch never uses one up.
-- Rows written before Sprint 38 stay as they are, marked chain_legacy = TRUE (a new
-- column defaulting TRUE for existing rows only); each register's chain starts after them.
ALTER TABLE h1_register
  ADD COLUMN IF NOT EXISTS chain_legacy BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE h1_register ALTER COLUMN chain_legacy SET DEFAULT FALSE;
ALTER TABLE h1_register
  ADD COLUMN IF NOT EXISTS register_key       VARCHAR(160),
  ADD COLUMN IF NOT EXISTS seller_licence_no  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS prescriber_address TEXT,
  ADD COLUMN IF NOT EXISTS entry_no           BIGINT,
  ADD COLUMN IF NOT EXISTS prev_hash          CHAR(64),
  ADD COLUMN IF NOT EXISTS row_hash           CHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_h1_register_entry ON h1_register (register_key, entry_no) WHERE entry_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_h1_register_partner ON h1_register (partner_id, dispensed_at);

-- A new entry is complete or it is not written (and the dispatch rolls back)
DO $$ BEGIN
  ALTER TABLE h1_register ADD CONSTRAINT h1_register_complete CHECK (chain_legacy OR (
        register_key IS NOT NULL
    AND btrim(COALESCE(seller_licence_no, '')) <> ''
    AND btrim(patient_name) <> '' AND lower(btrim(patient_name)) <> 'not recorded'
    AND btrim(patient_address) <> ''
    AND btrim(prescriber_name) <> '' AND lower(btrim(prescriber_name)) <> 'not recorded'
    AND btrim(COALESCE(prescriber_address, '')) <> ''
    AND btrim(COALESCE(batch_number, '')) <> ''
    AND btrim(COALESCE(pharmacist_name, '')) <> ''
    AND btrim(COALESCE(pharmacist_reg_no, '')) <> ''
    AND prescription_id IS NOT NULL AND quantity > 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION dawabag_h1_canonical(r h1_register) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT concat_ws(E'\n', 'dawabag-h1-register-v1',
    dawabag_canon('register_key', r.register_key),
    dawabag_canon('entry_no', r.entry_no::text),
    dawabag_canon('id', r.id::text),
    dawabag_canon('dispensed_at', dawabag_canon_ts(r.dispensed_at)),
    dawabag_canon('seller_type', r.seller_type),
    dawabag_canon('partner_id', r.partner_id::text),
    dawabag_canon('seller_licence_no', r.seller_licence_no),
    dawabag_canon('order_id', r.order_id::text),
    dawabag_canon('order_item_id', r.order_item_id::text),
    dawabag_canon('product_id', r.product_id::text),
    dawabag_canon('product_name', r.product_name),
    dawabag_canon('batch_number', r.batch_number),
    dawabag_canon('quantity', r.quantity::text),
    dawabag_canon('patient_name', r.patient_name),
    dawabag_canon('patient_address', r.patient_address),
    dawabag_canon('prescriber_name', r.prescriber_name),
    dawabag_canon('prescriber_address', r.prescriber_address),
    dawabag_canon('prescriber_reg_no', r.prescriber_reg_no),
    dawabag_canon('prescription_id', r.prescription_id::text),
    dawabag_canon('pharmacist_name', r.pharmacist_name),
    dawabag_canon('pharmacist_reg_no', r.pharmacist_reg_no),
    dawabag_canon('prev_hash', r.prev_hash))
$$;
-- (concat_ws only joins the field lines above, none of which is ever NULL)

-- On insert: a new entry always joins the chain; numbers and hashes come from the seal only
CREATE OR REPLACE FUNCTION dawabag_h1_before_insert() RETURNS trigger AS $$
BEGIN
  NEW.chain_legacy := FALSE;
  NEW.entry_no := NULL; NEW.prev_hash := NULL; NEW.row_hash := NULL;
  NEW.dispensed_at := date_trunc('milliseconds', COALESCE(NEW.dispensed_at, now()));
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS h1_register_before_insert ON h1_register;
CREATE TRIGGER h1_register_before_insert BEFORE INSERT ON h1_register
  FOR EACH ROW EXECUTE FUNCTION dawabag_h1_before_insert();

CREATE OR REPLACE FUNCTION dawabag_h1_seal() RETURNS trigger AS $$
DECLARE
  r h1_register;
  prev RECORD;
BEGIN
  SELECT * INTO r FROM h1_register WHERE id = NEW.id;
  IF NOT FOUND OR r.chain_legacy OR r.row_hash IS NOT NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(72000038, hashtext('h1:' || r.register_key));
  SELECT entry_no, row_hash INTO prev FROM h1_register
   WHERE register_key = r.register_key AND row_hash IS NOT NULL AND NOT chain_legacy
   ORDER BY entry_no DESC LIMIT 1;
  r.entry_no := COALESCE(prev.entry_no, 0) + 1;
  r.prev_hash := COALESCE(prev.row_hash, repeat('0', 64));
  UPDATE h1_register SET entry_no = r.entry_no, prev_hash = r.prev_hash,
         row_hash = dawabag_sha256_hex(dawabag_h1_canonical(r))
   WHERE id = r.id;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS h1_register_seal ON h1_register;
CREATE CONSTRAINT TRIGGER h1_register_seal AFTER INSERT ON h1_register
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dawabag_h1_seal();

DROP TRIGGER IF EXISTS h1_register_final ON h1_register;
CREATE TRIGGER h1_register_final BEFORE UPDATE OR DELETE ON h1_register
  FOR EACH ROW EXECUTE FUNCTION dawabag_chain_final();

-- ── 3. Audit log hash chain (C-46) ───────────────────────────────────────────
-- One global chain (chain_seq 1, 2, 3 …). Volume: the number and hash are set at
-- COMMIT by a deferred trigger under one advisory lock, so the lock is held only
-- for the moment a transaction commits — never while it does its work — and it
-- cannot deadlock with row locks the transaction already holds. Cost: one extra
-- row version per audit entry. Existing rows: chain_legacy = TRUE.
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS chain_legacy BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE audit_logs ALTER COLUMN chain_legacy SET DEFAULT FALSE;
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS chain_seq BIGINT,
  ADD COLUMN IF NOT EXISTS prev_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS row_hash  CHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_logs_chain ON audit_logs (chain_seq) WHERE chain_seq IS NOT NULL;

CREATE OR REPLACE FUNCTION dawabag_audit_canonical(r audit_logs) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT concat_ws(E'\n', 'dawabag-audit-v1',
    dawabag_canon('chain_seq', r.chain_seq::text),
    dawabag_canon('id', r.id::text),
    dawabag_canon('created_at', dawabag_canon_ts(r.created_at)),
    dawabag_canon('user_id', r.user_id::text),
    dawabag_canon('action', r.action),
    dawabag_canon('entity', r.entity),
    dawabag_canon('entity_id', r.entity_id::text),
    dawabag_canon('metadata', r.metadata::text),
    dawabag_canon('ip_address', r.ip_address::text),
    dawabag_canon('user_agent', r.user_agent),
    dawabag_canon('old_value', r.old_value::text),
    dawabag_canon('new_value', r.new_value::text),
    dawabag_canon('performed_by', r.performed_by::text),
    dawabag_canon('notes', r.notes),
    dawabag_canon('prev_hash', r.prev_hash))
$$;

CREATE OR REPLACE FUNCTION dawabag_audit_before_insert() RETURNS trigger AS $$
BEGIN
  NEW.chain_legacy := FALSE;
  NEW.chain_seq := NULL; NEW.prev_hash := NULL; NEW.row_hash := NULL;
  NEW.created_at := date_trunc('milliseconds', COALESCE(NEW.created_at, now()));
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_logs_before_insert ON audit_logs;
CREATE TRIGGER audit_logs_before_insert BEFORE INSERT ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION dawabag_audit_before_insert();

CREATE OR REPLACE FUNCTION dawabag_audit_seal() RETURNS trigger AS $$
DECLARE
  r audit_logs;
  prev RECORD;
BEGIN
  SELECT * INTO r FROM audit_logs WHERE id = NEW.id;
  IF NOT FOUND OR r.chain_legacy OR r.row_hash IS NOT NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(72000038, 0);
  SELECT chain_seq, row_hash INTO prev FROM audit_logs
   WHERE chain_seq IS NOT NULL ORDER BY chain_seq DESC LIMIT 1;
  r.chain_seq := COALESCE(prev.chain_seq, 0) + 1;
  r.prev_hash := COALESCE(prev.row_hash, repeat('0', 64));
  UPDATE audit_logs SET chain_seq = r.chain_seq, prev_hash = r.prev_hash,
         row_hash = dawabag_sha256_hex(dawabag_audit_canonical(r))
   WHERE id = r.id;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_logs_seal ON audit_logs;
CREATE CONSTRAINT TRIGGER audit_logs_seal AFTER INSERT ON audit_logs
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION dawabag_audit_seal();

DROP TRIGGER IF EXISTS audit_logs_final ON audit_logs;
CREATE TRIGGER audit_logs_final BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION dawabag_chain_final();

-- ── 4. Prescriptions: frozen once verified; dispense ledger; two clocks ──────
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS prescriber_address TEXT,
  ADD COLUMN IF NOT EXISTS retain_until DATE;     -- keep at least until (C-34); valid_until = dispensing window
CREATE INDEX IF NOT EXISTS idx_prescriptions_retain ON prescriptions (retain_until) WHERE retain_until IS NOT NULL;

-- How long a prescription is kept after its last dispense (owner confirmed 3 years, 2026-10-03)
INSERT INTO app_settings (key, value, description) VALUES
  ('retention.prescription_years', '3',
   'Years a prescription is kept after its last dispense (retain_until). Owner confirmed 3 (2026-10-03); C-34'),
  ('retention.prescription_purge', 'false',
   'Delete prescriptions whose retain_until has passed (not those on the H1 register). Off until the owner switches it on; C-34, C-44')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION dawabag_prescription_retain_years() RETURNS integer
LANGUAGE sql STABLE AS $$
  SELECT GREATEST(COALESCE((SELECT (value #>> '{}')::int FROM app_settings WHERE key = 'retention.prescription_years'), 3), 3)
$$;

-- Verified (or expired / rejected) prescriptions cannot be changed or deleted. The only
-- changes left: verified → expired; filling a prescriber address or registration
-- number that is still empty (a pharmacist completing the H1 details, audited by the
-- API); retain_until moving later (a new dispense).
CREATE OR REPLACE FUNCTION dawabag_prescription_frozen() RETURNS trigger AS $$
DECLARE
  keep CONSTANT text[] := ARRAY['status', 'prescriber_address', 'prescriber_reg_no', 'retain_until'];
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'A checked prescription cannot be deleted (C-34)' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'pending' THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - keep) IS DISTINCT FROM (to_jsonb(OLD) - keep)
     OR (NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'verified' AND NEW.status = 'expired'))
     OR (NEW.prescriber_address IS DISTINCT FROM OLD.prescriber_address AND btrim(COALESCE(OLD.prescriber_address, '')) <> '')
     OR (NEW.prescriber_reg_no IS DISTINCT FROM OLD.prescriber_reg_no AND btrim(COALESCE(OLD.prescriber_reg_no, '')) <> '')
     OR (NEW.retain_until IS DISTINCT FROM OLD.retain_until AND (NEW.retain_until IS NULL OR NEW.retain_until < OLD.retain_until)) THEN
    RAISE EXCEPTION 'A % prescription cannot be changed (C-08)', OLD.status USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS prescriptions_frozen ON prescriptions;
CREATE TRIGGER prescriptions_frozen BEFORE UPDATE OR DELETE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION dawabag_prescription_frozen();

-- What a prescription allows (prescribed_qty) is entered while it is pending and frozen after
CREATE OR REPLACE FUNCTION dawabag_prescription_items_frozen() RETURNS trigger AS $$
DECLARE st text;
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT status INTO st FROM prescriptions WHERE id = COALESCE(NEW.prescription_id, OLD.prescription_id);
  IF st IS NOT NULL AND st <> 'pending' THEN
    RAISE EXCEPTION 'The medicines on a % prescription cannot be changed (C-08)', st USING ERRCODE = 'P0001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS prescription_items_frozen ON prescription_items;
CREATE TRIGGER prescription_items_frozen BEFORE INSERT OR UPDATE OR DELETE ON prescription_items
  FOR EACH ROW EXECUTE FUNCTION dawabag_prescription_items_frozen();

-- Append-only dispense ledger: one row per quantity allowed against an order line
-- ('dispense'), one per quantity given back when that order is cancelled ('reversal').
-- Replaces the old running counter prescription_items.dispensed_qty, whose values move
-- in as 'legacy_opening' rows. (Foreign keys cascade only for clean-up of test data:
-- every delete still passes the finality trigger, i.e. needs a maintenance session.)
CREATE TABLE IF NOT EXISTS rx_dispense_ledger (
  id              BIGSERIAL PRIMARY KEY,
  prescription_id UUID NOT NULL,
  product_id      UUID NOT NULL,
  kind            VARCHAR(16) NOT NULL CHECK (kind IN ('dispense', 'reversal', 'legacy_opening')),
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  order_id        UUID REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id   UUID REFERENCES order_items(id) ON DELETE CASCADE,
  recorded_by     UUID REFERENCES users(id),
  reason          VARCHAR(200),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (prescription_id, product_id) REFERENCES prescription_items(prescription_id, product_id) ON DELETE CASCADE,
  CHECK (kind = 'legacy_opening' OR order_item_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_rx_ledger_item ON rx_dispense_ledger (prescription_id, product_id);
CREATE INDEX IF NOT EXISTS idx_rx_ledger_order_item ON rx_dispense_ledger (order_item_id);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prescription_items' AND column_name = 'dispensed_qty') THEN
    -- the trigger above refuses inserts for checked prescriptions; this is the migration itself
    ALTER TABLE rx_dispense_ledger DISABLE TRIGGER USER;
    INSERT INTO rx_dispense_ledger (prescription_id, product_id, kind, quantity, reason)
      SELECT prescription_id, product_id, 'legacy_opening', dispensed_qty, 'Counter before Sprint 38'
      FROM prescription_items WHERE dispensed_qty > 0;
    ALTER TABLE rx_dispense_ledger ENABLE TRIGGER USER;
    ALTER TABLE prescription_items DROP COLUMN dispensed_qty;   -- its CHECKs go with it
  END IF;
END $$;

-- Reads: what has been dispensed and what is left, per prescription line
CREATE OR REPLACE VIEW prescription_item_balances AS
  SELECT pi.prescription_id, pi.product_id, pi.prescribed_qty,
         COALESCE(SUM(CASE WHEN l.kind = 'reversal' THEN -l.quantity ELSE l.quantity END), 0)::int AS dispensed_qty,
         (pi.prescribed_qty - COALESCE(SUM(CASE WHEN l.kind = 'reversal' THEN -l.quantity ELSE l.quantity END), 0))::int AS remaining_qty
  FROM prescription_items pi
  LEFT JOIN rx_dispense_ledger l ON l.prescription_id = pi.prescription_id AND l.product_id = pi.product_id
  GROUP BY pi.prescription_id, pi.product_id, pi.prescribed_qty;

-- The balance rule (was CHECK dispensed_qty <= prescribed_qty), under a lock on the line
CREATE OR REPLACE FUNCTION dawabag_rx_ledger_before_insert() RETURNS trigger AS $$
DECLARE
  allowed integer;
  used integer;
  line_net integer;
BEGIN
  SELECT prescribed_qty INTO allowed FROM prescription_items
   WHERE prescription_id = NEW.prescription_id AND product_id = NEW.product_id FOR UPDATE;
  SELECT COALESCE(SUM(CASE WHEN kind = 'reversal' THEN -quantity ELSE quantity END), 0) INTO used
    FROM rx_dispense_ledger WHERE prescription_id = NEW.prescription_id AND product_id = NEW.product_id;
  IF NEW.kind = 'reversal' THEN
    SELECT COALESCE(SUM(CASE WHEN kind = 'reversal' THEN -quantity ELSE quantity END), 0) INTO line_net
      FROM rx_dispense_ledger WHERE order_item_id = NEW.order_item_id
       AND prescription_id = NEW.prescription_id AND product_id = NEW.product_id;
    IF NEW.quantity > line_net THEN
      RAISE EXCEPTION 'Only % unit(s) of this order line were dispensed against the prescription', line_net USING ERRCODE = 'P0001';
    END IF;
  ELSIF used + NEW.quantity > allowed THEN
    RAISE EXCEPTION 'Only % unit(s) left on the prescription', allowed - used USING ERRCODE = 'P0001';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS rx_dispense_ledger_before_insert ON rx_dispense_ledger;
CREATE TRIGGER rx_dispense_ledger_before_insert BEFORE INSERT ON rx_dispense_ledger
  FOR EACH ROW EXECUTE FUNCTION dawabag_rx_ledger_before_insert();

-- Second clock: kept at least N years after the last dispense (C-34)
CREATE OR REPLACE FUNCTION dawabag_rx_ledger_after_insert() RETURNS trigger AS $$
BEGIN
  IF NEW.kind = 'dispense' THEN
    UPDATE prescriptions
       SET retain_until = GREATEST(COALESCE(retain_until, CURRENT_DATE),
                                   (CURRENT_DATE + make_interval(years => dawabag_prescription_retain_years()))::date)
     WHERE id = NEW.prescription_id
       AND (retain_until IS NULL OR retain_until < (CURRENT_DATE + make_interval(years => dawabag_prescription_retain_years()))::date);
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS rx_dispense_ledger_after_insert ON rx_dispense_ledger;
CREATE TRIGGER rx_dispense_ledger_after_insert AFTER INSERT ON rx_dispense_ledger
  FOR EACH ROW EXECUTE FUNCTION dawabag_rx_ledger_after_insert();

DROP TRIGGER IF EXISTS rx_dispense_ledger_final ON rx_dispense_ledger;
CREATE TRIGGER rx_dispense_ledger_final BEFORE UPDATE OR DELETE ON rx_dispense_ledger
  FOR EACH ROW EXECUTE FUNCTION dawabag_records_are_final();

-- Existing checked prescriptions get their second clock: last dispense (or check) + N years.
-- (Done in a maintenance block: they are frozen from here on.)
DO $$ BEGIN
  SET LOCAL ROLE dawabag_maintenance;
  PERFORM set_config('dawabag.maintenance', 'on', true);
  UPDATE prescriptions p SET retain_until = (COALESCE(
      (SELECT MAX(l.created_at)::date FROM rx_dispense_ledger l WHERE l.prescription_id = p.id),
      p.verified_at::date, p.created_at::date) + make_interval(years => dawabag_prescription_retain_years()))::date
   WHERE p.retain_until IS NULL AND p.status <> 'pending';
  PERFORM set_config('dawabag.maintenance', 'off', true);
  RESET ROLE;
END $$;

-- The controlled maintenance route for the retention purge (section 1): runs as
-- dawabag_maintenance, deletes only prescriptions whose retain_until has passed and
-- which are not on the H1 register (that register is kept on its own terms), and
-- returns the object-store keys for the API to delete. Callable by the API role.
CREATE OR REPLACE FUNCTION dawabag_purge_prescriptions(p_limit integer)
RETURNS TABLE (prescription_id uuid, s3_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM set_config('dawabag.maintenance', 'on', true);
  CREATE TEMP TABLE IF NOT EXISTS _rx_purge (id uuid PRIMARY KEY, key text) ON COMMIT DROP;
  DELETE FROM _rx_purge;
  INSERT INTO _rx_purge (id, key)
    SELECT p.id, p.s3_key FROM prescriptions p
    WHERE p.retain_until IS NOT NULL AND p.retain_until < CURRENT_DATE
      AND NOT EXISTS (SELECT 1 FROM h1_register h WHERE h.prescription_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
                      WHERE oi.prescription_id = p.id
                        AND o.status NOT IN ('delivered', 'cancelled', 'returned', 'rx_rejected', 'payment_failed'))
    ORDER BY p.retain_until LIMIT GREATEST(LEAST(p_limit, 10000), 0)
    FOR UPDATE OF p SKIP LOCKED;
  DELETE FROM rx_dispense_ledger WHERE rx_dispense_ledger.prescription_id IN (SELECT id FROM _rx_purge);
  UPDATE order_items SET prescription_id = NULL WHERE order_items.prescription_id IN (SELECT id FROM _rx_purge);
  UPDATE orders SET requested_prescription_id = NULL WHERE requested_prescription_id IN (SELECT id FROM _rx_purge);
  DELETE FROM prescription_items WHERE prescription_items.prescription_id IN (SELECT id FROM _rx_purge);
  DELETE FROM prescriptions WHERE id IN (SELECT id FROM _rx_purge);
  PERFORM set_config('dawabag.maintenance', 'off', true);
  RETURN QUERY SELECT id, key FROM _rx_purge;
END $$;
ALTER FUNCTION dawabag_purge_prescriptions(integer) OWNER TO dawabag_maintenance;
REVOKE ALL ON FUNCTION dawabag_purge_prescriptions(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dawabag_purge_prescriptions(integer) TO dawabag_app;
DO $$ BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION dawabag_purge_prescriptions(integer) TO %I', current_user);
END $$;

-- ── 5. Emergency stop for prescription-medicine sales (owner, 2026-10-03) ─────
-- Open by default. Changed only through POST /admin/emergency-stop/{pause,resume}
-- (super_admin, audited) — not through the general settings editor.
INSERT INTO app_settings (key, value, description) VALUES
  ('sales.rx_pause', '{"paused": false}',
   'Emergency stop for prescription-medicine sales (Schedule H / H1 for retail buyers). Use the Emergency stop page; C-08')
ON CONFLICT (key) DO NOTHING;

-- ── 6. No referral codes for doctor accounts (handover D22; C-20) ─────────────
UPDATE user_profiles SET referral_code = NULL
 WHERE referral_code IS NOT NULL
   AND user_id IN (SELECT id FROM users WHERE customer_type = 'doc_hospital' OR role = 'doctor');

-- ── 7. Privileges ────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO dawabag_app, dawabag_maintenance;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dawabag_app, dawabag_maintenance;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO dawabag_app, dawabag_maintenance;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dawabag_app, dawabag_maintenance;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO dawabag_app, dawabag_maintenance;
