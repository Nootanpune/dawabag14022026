-- ─────────────────────────────────────────────────────────────────────────────
-- 35_sprint40_gdp_product_class_drills_inspections.sql — Sprint 40
-- Applied by the migration runner (backend/src/db/migrate.ts). Safe to re-run.
--
--  1. Good Distribution Practice (GDP) records per batch — Dawabag's own batches and
--     partner batches the partner records — append-only. A temperature excursion on a
--     cold-chain batch puts the batch ON HOLD (not sellable, not packable, not
--     dispatchable) until a pharmacist with a valid registration records a disposition
--     (release with justification / quarantine / destroy). (handover D17/D19; C-25, C-28)
--  2. Product class (drug / device / cosmetic / ayush / general) and the new-drug flag
--     (NDCT Rules 2019). Devices can never be 'permitted' for online sale until a device
--     track exists; a new drug is 'permitted' only with a pharmacist's confirmation note.
--     (handover D6, URS-040/041; C-10, C-17)
--  3. Mock recall drills (O15; C-28) — the real trace, no buyer is contacted.
--  4. Self-inspection register (O15; C-34): checklist templates, append-only inspection
--     results, corrective actions with an append-only status history.
--  5. Recorded chain heads (H1 registers + audit log) so a later truncation of a
--     chain is detected by the nightly verify job (C-09, C-46).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. GDP records per batch ─────────────────────────────────────────────────
-- The batch's GDP standing, kept by the database itself from gdp_records (below):
--   ok          sellable as far as GDP is concerned
--   on_hold     a cold-chain excursion waits for a pharmacist's disposition
--   quarantined set aside by a pharmacist; still waits for release or destruction
--   destroyed   to be destroyed (Dawabag: a write-off in the destruction register)
ALTER TABLE inventory_batches ADD COLUMN IF NOT EXISTS gdp_status VARCHAR(12) NOT NULL DEFAULT 'ok';
ALTER TABLE partner_inventory ADD COLUMN IF NOT EXISTS gdp_status VARCHAR(12) NOT NULL DEFAULT 'ok';
ALTER TABLE inventory_batches DROP CONSTRAINT IF EXISTS inventory_batches_gdp_status_check;
ALTER TABLE inventory_batches ADD CONSTRAINT inventory_batches_gdp_status_check
  CHECK (gdp_status IN ('ok', 'on_hold', 'quarantined', 'destroyed'));
ALTER TABLE partner_inventory DROP CONSTRAINT IF EXISTS partner_inventory_gdp_status_check;
ALTER TABLE partner_inventory ADD CONSTRAINT partner_inventory_gdp_status_check
  CHECK (gdp_status IN ('ok', 'on_hold', 'quarantined', 'destroyed'));
CREATE INDEX IF NOT EXISTS idx_batches_gdp_held ON inventory_batches (gdp_status) WHERE gdp_status <> 'ok';
CREATE INDEX IF NOT EXISTS idx_pinv_gdp_held ON partner_inventory (gdp_status) WHERE gdp_status <> 'ok';

CREATE TABLE IF NOT EXISTS gdp_records (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id             UUID REFERENCES inventory_batches(id) ON DELETE CASCADE,     -- Dawabag's own batch
  partner_inventory_id UUID REFERENCES partner_inventory(id) ON DELETE CASCADE,     -- a partner's batch
  partner_id           UUID REFERENCES vendors(id),
  product_id           UUID NOT NULL REFERENCES products(id),
  batch_number         VARCHAR(100) NOT NULL,
  event_kind           VARCHAR(24) NOT NULL,
  storage_condition    VARCHAR(160),
  temperature_c        NUMERIC(5,2),
  cold_chain           BOOLEAN NOT NULL DEFAULT FALSE,
  location             VARCHAR(100),
  -- excursion_disposition only: which excursion, what was decided, by which pharmacist
  excursion_id         UUID REFERENCES gdp_records(id) ON DELETE CASCADE,
  disposition          VARCHAR(12),
  justification        TEXT,
  pharmacist_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  vendor_pharmacist_id UUID REFERENCES vendor_pharmacists(id) ON DELETE SET NULL,
  pharmacist_name      VARCHAR(255),
  pharmacist_reg_no    VARCHAR(50),
  stock_adjustment_id  UUID REFERENCES stock_adjustments(id) ON DELETE SET NULL,   -- destroy: the write-off in the destruction register
  source               VARCHAR(12) NOT NULL,
  grn_line_id          UUID REFERENCES grn_lines(id) ON DELETE SET NULL,
  shipment_id          UUID REFERENCES order_shipments(id) ON DELETE SET NULL,
  notes                TEXT,
  recorded_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  recorded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gdp_records_one_batch CHECK ((batch_id IS NULL) <> (partner_inventory_id IS NULL)),
  CONSTRAINT gdp_records_partner_batch CHECK (partner_inventory_id IS NULL OR partner_id IS NOT NULL),
  CONSTRAINT gdp_records_kind_check CHECK (event_kind IN (
    'received', 'storage_check', 'temperature_reading', 'excursion', 'excursion_disposition', 'transfer', 'dispatch')),
  CONSTRAINT gdp_records_source_check CHECK (source IN ('staff', 'partner', 'grn', 'dispatch', 'system')),
  CONSTRAINT gdp_records_temperature_range CHECK (temperature_c IS NULL OR temperature_c BETWEEN -80 AND 80),
  CONSTRAINT gdp_records_reading_has_temperature CHECK (event_kind <> 'temperature_reading' OR temperature_c IS NOT NULL),
  CONSTRAINT gdp_records_disposition_check CHECK (
    (event_kind = 'excursion_disposition') = (disposition IS NOT NULL)
    AND (disposition IS NULL OR (
          disposition IN ('release', 'quarantine', 'destroy')
      AND excursion_id IS NOT NULL
      AND length(btrim(COALESCE(justification, ''))) >= 10
      AND btrim(COALESCE(pharmacist_name, '')) <> ''
      AND btrim(COALESCE(pharmacist_reg_no, '')) <> ''))),   -- the named pharmacist is the record; the service checks the login / partner pharmacist
  CONSTRAINT gdp_records_excursion_note CHECK (event_kind <> 'excursion' OR length(btrim(COALESCE(notes, ''))) >= 5)
);
CREATE INDEX IF NOT EXISTS idx_gdp_records_batch ON gdp_records (batch_id, recorded_at) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gdp_records_pinv ON gdp_records (partner_inventory_id, recorded_at) WHERE partner_inventory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gdp_records_excursion ON gdp_records (excursion_id) WHERE excursion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gdp_records_open ON gdp_records (recorded_at) WHERE event_kind = 'excursion';

-- Before insert: the record carries the batch's facts (product, number, partner, cold
-- chain) whoever writes it, and a cold-chain reading outside 2–8 °C is an excursion.
CREATE OR REPLACE FUNCTION dawabag_gdp_before_insert() RETURNS trigger AS $$
DECLARE
  b RECORD;
  ex RECORD;
BEGIN
  IF NEW.batch_id IS NOT NULL THEN
    SELECT ib.product_id, ib.batch_number, NULL::uuid AS partner_id, COALESCE(p.cold_chain, FALSE) AS cold_chain, ib.gdp_status
      INTO b FROM inventory_batches ib JOIN products p ON p.id = ib.product_id WHERE ib.id = NEW.batch_id;
  ELSE
    SELECT pp.product_id, pi.batch_number, pi.partner_id, COALESCE(p.cold_chain, FALSE) OR COALESCE(pi.cold_chain_confirmed, FALSE) AS cold_chain,
           pi.gdp_status
      INTO b FROM partner_inventory pi JOIN partner_products pp ON pp.id = pi.partner_product_id
      JOIN products p ON p.id = pp.product_id WHERE pi.id = NEW.partner_inventory_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch not found for this GDP record' USING ERRCODE = 'foreign_key_violation'; END IF;
  NEW.product_id := b.product_id;
  NEW.batch_number := b.batch_number;
  NEW.partner_id := b.partner_id;
  NEW.cold_chain := NEW.cold_chain OR b.cold_chain;
  NEW.recorded_at := date_trunc('milliseconds', COALESCE(NEW.recorded_at, now()));
  IF NEW.event_kind = 'temperature_reading' AND NEW.cold_chain AND (NEW.temperature_c < 2 OR NEW.temperature_c > 8) THEN
    NEW.event_kind := 'excursion';
    NEW.notes := btrim(concat_ws(' ', 'Reading ' || NEW.temperature_c::text || ' °C is outside 2–8 °C.', NEW.notes));
  END IF;
  IF NEW.event_kind = 'excursion_disposition' THEN
    SELECT id, batch_id, partner_inventory_id, event_kind INTO ex FROM gdp_records WHERE id = NEW.excursion_id;
    IF NOT FOUND OR ex.event_kind <> 'excursion'
       OR ex.batch_id IS DISTINCT FROM NEW.batch_id OR ex.partner_inventory_id IS DISTINCT FROM NEW.partner_inventory_id THEN
      RAISE EXCEPTION 'A disposition names an excursion of the same batch' USING ERRCODE = 'check_violation';
    END IF;
    -- A released or destroyed excursion is decided; a quarantined one waits for release or destruction
    IF EXISTS (SELECT 1 FROM gdp_records WHERE excursion_id = NEW.excursion_id AND disposition IN ('release', 'destroy')) THEN
      RAISE EXCEPTION 'This excursion has already been decided' USING ERRCODE = 'check_violation';
    END IF;
    IF b.gdp_status = 'destroyed' AND NEW.disposition <> 'destroy' THEN
      RAISE EXCEPTION 'This batch is to be destroyed; it cannot be released' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS gdp_records_before_insert ON gdp_records;
CREATE TRIGGER gdp_records_before_insert BEFORE INSERT ON gdp_records
  FOR EACH ROW EXECUTE FUNCTION dawabag_gdp_before_insert();

-- After insert: the batch's GDP standing follows its records (C-25)
CREATE OR REPLACE FUNCTION dawabag_gdp_batch_status(p_batch uuid, p_pinv uuid) RETURNS varchar
LANGUAGE sql STABLE AS $$
  WITH ex AS (
    SELECT e.id,
           (SELECT d.disposition FROM gdp_records d WHERE d.excursion_id = e.id ORDER BY d.recorded_at DESC, d.id DESC LIMIT 1) AS last_disposition
    FROM gdp_records e
    WHERE e.event_kind = 'excursion' AND e.cold_chain
      AND (e.batch_id = p_batch OR e.partner_inventory_id = p_pinv))
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM ex WHERE last_disposition = 'destroy') THEN 'destroyed'
    WHEN EXISTS (SELECT 1 FROM ex WHERE last_disposition IS NULL) THEN 'on_hold'
    WHEN EXISTS (SELECT 1 FROM ex WHERE last_disposition = 'quarantine') THEN 'quarantined'
    ELSE 'ok' END
$$;

CREATE OR REPLACE FUNCTION dawabag_gdp_after_insert() RETURNS trigger AS $$
BEGIN
  IF NEW.event_kind IN ('excursion', 'excursion_disposition') THEN
    IF NEW.batch_id IS NOT NULL THEN
      UPDATE inventory_batches SET gdp_status = dawabag_gdp_batch_status(NEW.batch_id, NULL) WHERE id = NEW.batch_id;
    ELSE
      UPDATE partner_inventory SET gdp_status = dawabag_gdp_batch_status(NULL, NEW.partner_inventory_id) WHERE id = NEW.partner_inventory_id;
    END IF;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS gdp_records_after_insert ON gdp_records;
CREATE TRIGGER gdp_records_after_insert AFTER INSERT ON gdp_records
  FOR EACH ROW EXECUTE FUNCTION dawabag_gdp_after_insert();

-- GDP records are final (C-25, C-34): no update, no delete outside maintenance
CREATE OR REPLACE FUNCTION dawabag_gdp_records_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION 'GDP records are append-only and cannot be changed (C-25, C-34)' USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS gdp_records_final ON gdp_records;
CREATE TRIGGER gdp_records_final BEFORE UPDATE OR DELETE ON gdp_records
  FOR EACH ROW EXECUTE FUNCTION dawabag_gdp_records_final();

-- The batch's GDP standing is set only by the trigger above (or maintenance): an API
-- UPDATE of gdp_status cannot lift a hold without a pharmacist's disposition record
CREATE OR REPLACE FUNCTION dawabag_gdp_status_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.gdp_status IS DISTINCT FROM OLD.gdp_status AND pg_trigger_depth() <= 1 AND NOT dawabag_maintenance_active() THEN
    RAISE EXCEPTION 'A batch''s GDP hold changes only by a GDP record (excursion or pharmacist disposition, C-25)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_batches_gdp_status_guard ON inventory_batches;
CREATE TRIGGER trg_batches_gdp_status_guard BEFORE UPDATE OF gdp_status ON inventory_batches
  FOR EACH ROW EXECUTE FUNCTION dawabag_gdp_status_guard();
DROP TRIGGER IF EXISTS trg_pinv_gdp_status_guard ON partner_inventory;
CREATE TRIGGER trg_pinv_gdp_status_guard BEFORE UPDATE OF gdp_status ON partner_inventory
  FOR EACH ROW EXECUTE FUNCTION dawabag_gdp_status_guard();

-- ── 2. Product class and the new-drug flag ───────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products'
                 AND column_name = 'product_class') THEN
    ALTER TABLE products
      ADD COLUMN product_class VARCHAR(12) NOT NULL DEFAULT 'drug',
      ADD COLUMN is_new_drug   BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN new_drug_confirmation TEXT,
      ADD COLUMN new_drug_confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN new_drug_confirmed_at TIMESTAMPTZ;
    -- Backfill (documented in DECISIONS 2026-10-03 "Product class"): only OTC /
    -- non-scheduled products in a clearly non-medicine category leave 'drug'. Nothing
    -- becomes a device automatically (that would stop sales); a pharmacist or admin
    -- reclassifies devices one by one.
    UPDATE products SET product_class = CASE
      WHEN category ~* '(ayurved|ayush|homoeo|homeo|unani|siddha|herbal)' THEN 'ayush'
      WHEN drug_schedule IN ('OTC', 'Non-scheduled') AND category ~* '(cosmetic|beauty|skin ?care|hair ?care|personal ?care|fragrance|make ?up)' THEN 'cosmetic'
      WHEN drug_schedule IN ('OTC', 'Non-scheduled') AND category ~* '(grocery|nutrition|health ?food|baby ?food|hygiene|sanitary|fitness|household)' THEN 'general'
      ELSE 'drug' END
    WHERE category IS NOT NULL;
  END IF;
END $$;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_class_check;
ALTER TABLE products ADD CONSTRAINT products_product_class_check
  CHECK (product_class IN ('drug', 'device', 'cosmetic', 'ayush', 'general'));
-- Devices are outside the launch scope: never permitted until a device track exists
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_device_not_permitted;
ALTER TABLE products ADD CONSTRAINT products_device_not_permitted
  CHECK (NOT (product_class = 'device' AND online_sale_status = 'permitted'));
-- A new drug (NDCT Rules 2019) is permitted only with a pharmacist's confirmation note
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_new_drug_confirmed;
ALTER TABLE products ADD CONSTRAINT products_new_drug_confirmed
  CHECK (NOT (is_new_drug AND online_sale_status = 'permitted' AND new_drug_confirmation IS NULL));
CREATE INDEX IF NOT EXISTS idx_products_class ON products (product_class) WHERE deleted_at IS NULL;

-- The Sprint 39 guard, extended: a product that becomes a device, or is newly flagged a
-- new drug, stops being permitted at once (fail closed; the status log records it)
CREATE OR REPLACE FUNCTION dawabag_online_status_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.drug_schedule IS DISTINCT FROM OLD.drug_schedule
     AND NEW.drug_schedule IN ('Schedule X', 'NDPS') AND NEW.online_sale_status = 'permitted'
     AND OLD.online_sale_status = 'permitted' THEN
    NEW.online_sale_status := 'prohibited';
    NEW.online_sale_reason := 'Schedule changed to ' || NEW.drug_schedule || ': never sold online (C-10)';
    NEW.online_sale_ref := NULL;
    NEW.online_sale_ref_date := NULL;
    NEW.online_sale_set_at := NOW();
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_new_drug AND NOT OLD.is_new_drug THEN
    -- a fresh confirmation is needed for a product newly flagged as a new drug
    NEW.new_drug_confirmation := NULL;
    NEW.new_drug_confirmed_by := NULL;
    NEW.new_drug_confirmed_at := NULL;
    IF NEW.online_sale_status = 'permitted' AND OLD.online_sale_status = 'permitted' THEN
      NEW.online_sale_status := 'restricted';
      NEW.online_sale_reason := 'Marked as a new drug (NDCT Rules 2019): a pharmacist must confirm before it is sold online';
      NEW.online_sale_ref := NULL;
      NEW.online_sale_ref_date := NULL;
      NEW.online_sale_set_at := NOW();
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.product_class = 'device' AND OLD.product_class IS DISTINCT FROM 'device'
     AND NEW.online_sale_status = 'permitted' AND OLD.online_sale_status = 'permitted' THEN
    NEW.online_sale_status := 'restricted';
    NEW.online_sale_reason := 'Medical device: not sold online until Dawabag has a device track';
    NEW.online_sale_ref := NULL;
    NEW.online_sale_ref_date := NULL;
    NEW.online_sale_set_at := NOW();
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_online_status_guard ON products;
CREATE TRIGGER trg_online_status_guard BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION dawabag_online_status_guard();

-- The status log also keeps the new-drug confirmation that allowed a new drug
ALTER TABLE product_online_status_log ADD COLUMN IF NOT EXISTS new_drug_confirmation TEXT;
CREATE OR REPLACE FUNCTION dawabag_online_status_log_change() RETURNS trigger AS $$
BEGIN
  IF NEW.online_sale_status IS DISTINCT FROM OLD.online_sale_status
     OR NEW.online_sale_ref IS DISTINCT FROM OLD.online_sale_ref
     OR NEW.online_sale_reason IS DISTINCT FROM OLD.online_sale_reason
     OR NEW.new_drug_confirmation IS DISTINCT FROM OLD.new_drug_confirmation THEN
    INSERT INTO product_online_status_log (product_id, old_status, new_status, notification_ref, notification_date, reason, set_by, set_at,
                                           drug_schedule, new_drug_confirmation)
    VALUES (NEW.id, OLD.online_sale_status, NEW.online_sale_status, NEW.online_sale_ref, NEW.online_sale_ref_date,
            NEW.online_sale_reason, NEW.online_sale_set_by, COALESCE(NEW.online_sale_set_at, NOW()), NEW.drug_schedule,
            NEW.new_drug_confirmation);
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_online_status_log_change ON products;
CREATE TRIGGER trg_online_status_log_change
  AFTER UPDATE OF online_sale_status, online_sale_ref, online_sale_reason, drug_schedule, new_drug_confirmation, is_new_drug, product_class ON products
  FOR EACH ROW EXECUTE FUNCTION dawabag_online_status_log_change();

-- ── 3. Mock recall drills ────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS recall_drill_seq;
CREATE TABLE IF NOT EXISTS recall_drills (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_no         VARCHAR(24) NOT NULL UNIQUE,
  product_id       UUID NOT NULL REFERENCES products(id),
  batch_number     VARCHAR(100) NOT NULL,
  scenario         TEXT NOT NULL,
  started_by       UUID NOT NULL REFERENCES users(id),
  started_at       TIMESTAMPTZ NOT NULL,
  traced_at        TIMESTAMPTZ NOT NULL,
  time_to_trace_ms INTEGER NOT NULL CHECK (time_to_trace_ms >= 0),
  summary          JSONB NOT NULL,     -- counts: orders, units, buyers, partners, H1 entries, stock on hand
  findings         JSONB NOT NULL,     -- the full trace as found (orders, shipments, buyers, H1, stock by location)
  buyers_contacted BOOLEAN NOT NULL DEFAULT FALSE CHECK (NOT buyers_contacted),   -- a drill never contacts anyone
  -- Close-out, recorded once by an admin
  conclusion       TEXT,
  actions          TEXT,
  closed_by        UUID REFERENCES users(id),
  closed_at        TIMESTAMPTZ,
  CONSTRAINT recall_drills_close_check CHECK ((closed_at IS NULL) = (closed_by IS NULL)
    AND (closed_at IS NULL OR length(btrim(COALESCE(conclusion, ''))) >= 10)),
  CONSTRAINT recall_drills_order_check CHECK (traced_at >= started_at)
);
CREATE INDEX IF NOT EXISTS idx_recall_drills_started ON recall_drills (started_at DESC);

-- A drill as traced is final; only the one close-out may be added (C-28, C-34)
CREATE OR REPLACE FUNCTION dawabag_recall_drill_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'UPDATE' AND OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL
     AND (to_jsonb(NEW) - 'conclusion' - 'actions' - 'closed_by' - 'closed_at')
       = (to_jsonb(OLD) - 'conclusion' - 'actions' - 'closed_by' - 'closed_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'A recall drill record is final once traced; it can only be closed once (C-28)' USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS recall_drills_final ON recall_drills;
CREATE TRIGGER recall_drills_final BEFORE UPDATE OR DELETE ON recall_drills
  FOR EACH ROW EXECUTE FUNCTION dawabag_recall_drill_final();

-- ── 4. Self-inspection register ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS self_inspection_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(160) NOT NULL,
  frequency    VARCHAR(12) NOT NULL,
  items        JSONB NOT NULL,           -- [{ "key": "...", "label": "...", "guidance": "..." }]
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  overdue_alerted_for DATE,              -- the due date an overdue alert was last sent for
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT self_inspection_templates_frequency_check CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'annual')),
  CONSTRAINT self_inspection_templates_items_check CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) BETWEEN 1 AND 60)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_self_inspection_templates_name ON self_inspection_templates (lower(name));

CREATE SEQUENCE IF NOT EXISTS self_inspection_seq;
CREATE TABLE IF NOT EXISTS self_inspections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_no  VARCHAR(24) NOT NULL UNIQUE,
  template_id    UUID NOT NULL REFERENCES self_inspection_templates(id),
  template_name  VARCHAR(160) NOT NULL,
  inspected_by   UUID NOT NULL REFERENCES users(id),
  inspector_name VARCHAR(255),
  inspector_role VARCHAR(30) NOT NULL,
  inspected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary        TEXT,
  ok_count       INTEGER NOT NULL DEFAULT 0,
  observation_count INTEGER NOT NULL DEFAULT 0,
  non_conformity_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_self_inspections_template ON self_inspections (template_id, inspected_at DESC);

CREATE TABLE IF NOT EXISTS self_inspection_results (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES self_inspections(id) ON DELETE CASCADE,
  item_key      VARCHAR(60) NOT NULL,
  item_label    VARCHAR(300) NOT NULL,
  result        VARCHAR(16) NOT NULL,
  note          TEXT,
  CONSTRAINT self_inspection_results_result_check CHECK (result IN ('ok', 'observation', 'non_conformity')),
  CONSTRAINT self_inspection_results_note_check CHECK (result = 'ok' OR length(btrim(COALESCE(note, ''))) >= 5),
  UNIQUE (inspection_id, item_key)
);

CREATE SEQUENCE IF NOT EXISTS corrective_action_seq;
CREATE TABLE IF NOT EXISTS corrective_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_no       VARCHAR(24) NOT NULL UNIQUE,
  inspection_id   UUID NOT NULL REFERENCES self_inspections(id) ON DELETE CASCADE,
  result_id       UUID REFERENCES self_inspection_results(id) ON DELETE CASCADE,
  description     TEXT NOT NULL CHECK (length(btrim(description)) >= 5),
  owner_user_id   UUID NOT NULL REFERENCES users(id),
  due_date        DATE NOT NULL,
  status          VARCHAR(12) NOT NULL DEFAULT 'open',
  close_out_note  TEXT,
  closed_by       UUID REFERENCES users(id),
  closed_at       TIMESTAMPTZ,
  overdue_alerted_at TIMESTAMPTZ,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT corrective_actions_status_check CHECK (status IN ('open', 'in_progress', 'closed')),
  CONSTRAINT corrective_actions_closed_check CHECK ((status = 'closed') = (closed_at IS NOT NULL)
    AND (status <> 'closed' OR (closed_by IS NOT NULL AND length(btrim(COALESCE(close_out_note, ''))) >= 5)))
);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_open ON corrective_actions (due_date) WHERE status <> 'closed';

CREATE TABLE IF NOT EXISTS corrective_action_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id   UUID NOT NULL REFERENCES corrective_actions(id) ON DELETE CASCADE,
  from_status VARCHAR(12),
  to_status   VARCHAR(12) NOT NULL,
  note        TEXT,
  changed_by  UUID REFERENCES users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_corrective_action_events ON corrective_action_events (action_id, changed_at);

-- Inspections, their results and the action history are append-only (C-34)
CREATE OR REPLACE FUNCTION dawabag_self_inspection_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION '% on % is not allowed: the self-inspection register is append-only (C-34)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['self_inspections', 'self_inspection_results', 'corrective_action_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_final ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_final BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION dawabag_self_inspection_final()', t, t);
  END LOOP;
END $$;

-- A corrective action changes only its status (each change logged below), the
-- close-out once, and the overdue-alert mark; a closed action is final; never deleted
CREATE OR REPLACE FUNCTION dawabag_corrective_action_guard() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A corrective action cannot be deleted (C-34)' USING ERRCODE = 'check_violation'; END IF;
  IF OLD.status = 'closed' AND (to_jsonb(NEW) - 'overdue_alerted_at') <> (to_jsonb(OLD) - 'overdue_alerted_at') THEN
    RAISE EXCEPTION 'A closed corrective action is final (C-34)' USING ERRCODE = 'check_violation';
  END IF;
  IF (to_jsonb(NEW) - 'status' - 'close_out_note' - 'closed_by' - 'closed_at' - 'overdue_alerted_at')
     <> (to_jsonb(OLD) - 'status' - 'close_out_note' - 'closed_by' - 'closed_at' - 'overdue_alerted_at') THEN
    RAISE EXCEPTION 'Only the status of a corrective action can change (C-34)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS corrective_actions_guard ON corrective_actions;
CREATE TRIGGER corrective_actions_guard BEFORE UPDATE OR DELETE ON corrective_actions
  FOR EACH ROW EXECUTE FUNCTION dawabag_corrective_action_guard();

CREATE OR REPLACE FUNCTION dawabag_corrective_action_history() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO corrective_action_events (action_id, from_status, to_status, note, changed_by)
    VALUES (NEW.id, NULL, NEW.status, 'Raised', NEW.created_by);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO corrective_action_events (action_id, from_status, to_status, note, changed_by)
    VALUES (NEW.id, OLD.status, NEW.status, COALESCE(NULLIF(current_setting('dawabag.action_note', true), ''), NEW.close_out_note),
            COALESCE(NULLIF(current_setting('dawabag.action_by', true), '')::uuid, NEW.closed_by));
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS corrective_actions_history ON corrective_actions;
CREATE TRIGGER corrective_actions_history AFTER INSERT OR UPDATE OF status ON corrective_actions
  FOR EACH ROW EXECUTE FUNCTION dawabag_corrective_action_history();

-- A starting checklist (generic, no business data); admins edit or add their own
INSERT INTO self_inspection_templates (name, frequency, items)
SELECT 'Monthly pharmacy self-inspection', 'monthly', '[
  {"key": "storage_temperatures", "label": "Storage temperatures logged twice daily and within range (room and 2–8 °C)", "guidance": "Check the log and the data logger; any excursion recorded in GDP with a disposition"},
  {"key": "expiry_segregation", "label": "Expired, near-expiry and recalled stock segregated and labelled", "guidance": "Quarantine shelf separate; write-offs raised"},
  {"key": "licence_display", "label": "Drug licences and pharmacist registration displayed and in date", "guidance": "Form 20/21 and the registered pharmacist''s certificate"},
  {"key": "pharmacist_presence", "label": "Registered pharmacist present during working hours", "guidance": "Duty roster and sign-in"},
  {"key": "h1_register", "label": "Schedule H1 register complete and its chain check passes", "guidance": "Admin → Record integrity"},
  {"key": "cold_chain_equipment", "label": "Cold-chain equipment working and calibrated", "guidance": "Refrigerator, data loggers, cold packs; calibration dates"},
  {"key": "pest_control", "label": "Pest control done and recorded", "guidance": "Last service date and certificate"},
  {"key": "records", "label": "Purchase, sale and destruction records complete", "guidance": "GRNs, invoices, destruction register"}
]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM self_inspection_templates);

-- ── 5. Recorded chain heads ──────────────────────────────────────────────────
-- Each nightly verify (and each manual run) notes where every chain ends. A later run
-- that finds a chain shorter than a recorded head, or the head entry changed, reports
-- a break: removing the newest entries no longer goes unnoticed.
CREATE TABLE IF NOT EXISTS chain_heads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain       VARCHAR(200) NOT NULL,        -- 'audit' or 'h1:<register_key>'
  last_no     BIGINT,
  head_hash   CHAR(64),
  checked     INTEGER NOT NULL DEFAULT 0,
  ok          BOOLEAN NOT NULL,
  problem     TEXT,
  source      VARCHAR(10) NOT NULL,
  job_run_id  UUID,
  recorded_by UUID REFERENCES users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chain_heads_source_check CHECK (source IN ('job', 'manual'))
);
CREATE INDEX IF NOT EXISTS idx_chain_heads_chain ON chain_heads (chain, recorded_at DESC);

CREATE OR REPLACE FUNCTION dawabag_chain_heads_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION 'Recorded chain heads are append-only (C-46)' USING ERRCODE = 'check_violation';
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS chain_heads_final ON chain_heads;
CREATE TRIGGER chain_heads_final BEFORE UPDATE OR DELETE ON chain_heads
  FOR EACH ROW EXECUTE FUNCTION dawabag_chain_heads_final();

-- ── Privileges: the API role and the maintenance role (migration 33 default
-- privileges cover new tables; granted again here so the order of runs never matters)
GRANT SELECT, INSERT, UPDATE, DELETE ON gdp_records, recall_drills, self_inspection_templates, self_inspections,
  self_inspection_results, corrective_actions, corrective_action_events, chain_heads TO dawabag_app, dawabag_maintenance;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE recall_drill_seq, self_inspection_seq, corrective_action_seq TO dawabag_app, dawabag_maintenance;
