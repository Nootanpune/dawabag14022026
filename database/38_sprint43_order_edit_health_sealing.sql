-- ─────────────────────────────────────────────────────────────────────────────
-- 38_sprint43_order_edit_health_sealing.sql — Sprint 43
-- Applied by the migration runner (backend/src/db/migrate.ts) as the database owner.
-- Safe to re-run (IF NOT EXISTS, constraints and triggers re-created).
--
--  1. Changing an order before packing (URS-074; DECISIONS 2026-10-03 "Buyers can lower
--     quantities or remove lines before packing"). The tax invoice issued at placement
--     stays as it is (amounts final since Sprint 6, sale identity since Sprint 42): a
--     lowered or removed line gets a CREDIT NOTE in the seller's series (C-30, C-31,
--     C-37) and order_items.removed_qty grows; what is packed, dispatched, registered
--     (H1) and returnable is supply_qty = quantity - removed_qty. order_edits keeps who
--     changed what and the money returned (C-46); only its refund status may move on.
--  2. Health details sealed at rest (URS-006; DPDP sensitive data, C-41, C-44): the
--     API encrypts a buyer's allergies / conditions / current medicines and a family
--     member's allergies / conditions (services/healthProfile/sealing.ts, key in the
--     server's environment, never here). The plain JSONB columns stay '[]' once a row
--     is sealed — a check refuses plain values next to a sealed one. Rows written
--     before Sprint 43 are sealed by the API at its next start-up.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Order changes before packing ──────────────────────────────────────────
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS removed_qty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_removed_qty_range;
ALTER TABLE order_items ADD CONSTRAINT order_items_removed_qty_range CHECK (removed_qty >= 0 AND removed_qty <= quantity);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS supply_qty INTEGER GENERATED ALWAYS AS (quantity - removed_qty) STORED;

-- removed_qty only grows (a removal is undone by ordering again), except by the maintenance role
CREATE OR REPLACE FUNCTION dawabag_line_removed_only_grows() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN NEW; END IF;
  IF NEW.removed_qty < OLD.removed_qty THEN
    RAISE EXCEPTION 'A removed quantity cannot be put back on the invoice; place a new order instead' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS order_items_removed_only_grows ON order_items;
CREATE TRIGGER order_items_removed_only_grows BEFORE UPDATE OF removed_qty ON order_items
  FOR EACH ROW EXECUTE FUNCTION dawabag_line_removed_only_grows();

CREATE TABLE IF NOT EXISTS order_edits (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID NOT NULL REFERENCES orders(id),
  edited_by          UUID REFERENCES users(id),
  edited_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- [{order_item_id, product_name, from_qty, to_qty}]
  lines              JSONB NOT NULL,
  credit_notes       JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- the buyer's share of the credit notes (after any order discount); delivery charge unchanged
  refund_paise       INTEGER NOT NULL DEFAULT 0 CHECK (refund_paise >= 0),
  -- none: nothing paid yet for it; recorded: refund legs written; after_capture: an authorised
  -- (held) payment — Razorpay captures the authorised amount in full, so the difference is
  -- refunded right after the capture; not_needed: the hold was released (nothing charged)
  refund_status      VARCHAR(20) NOT NULL DEFAULT 'none'
                       CHECK (refund_status IN ('none', 'recorded', 'after_capture', 'not_needed')),
  refund_recorded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_order_edits_order ON order_edits (order_id);
CREATE INDEX IF NOT EXISTS idx_order_edits_after_capture ON order_edits (order_id) WHERE refund_status = 'after_capture';

-- Append-only, except the refund status moving on (C-46)
CREATE OR REPLACE FUNCTION dawabag_order_edits_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Order changes are kept: they cannot be deleted' USING ERRCODE = 'P0001'; END IF;
  IF (NEW.order_id, NEW.edited_by, NEW.edited_at, NEW.lines, NEW.credit_notes, NEW.refund_paise)
     IS DISTINCT FROM (OLD.order_id, OLD.edited_by, OLD.edited_at, OLD.lines, OLD.credit_notes, OLD.refund_paise) THEN
    RAISE EXCEPTION 'An order change is final; only its refund status may be updated' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS order_edits_final ON order_edits;
CREATE TRIGGER order_edits_final BEFORE UPDATE OR DELETE ON order_edits
  FOR EACH ROW EXECUTE FUNCTION dawabag_order_edits_final();

-- Refunds may come from an order change
ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_source_check;
ALTER TABLE refunds ADD CONSTRAINT refunds_source_check CHECK (source IN ('cancellation', 'return', 'admin', 'order_edit'));

-- ── 2. Health details sealed at rest ─────────────────────────────────────────
ALTER TABLE health_profiles ADD COLUMN IF NOT EXISTS sealed TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS health_sealed TEXT;

ALTER TABLE health_profiles DROP CONSTRAINT IF EXISTS health_profiles_sealed_only;
ALTER TABLE health_profiles ADD CONSTRAINT health_profiles_sealed_only CHECK (
  sealed IS NULL OR (allergies = '[]'::jsonb AND conditions = '[]'::jsonb AND current_medicines = '[]'::jsonb));
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_health_sealed_only;
ALTER TABLE patients ADD CONSTRAINT patients_health_sealed_only CHECK (
  health_sealed IS NULL OR (allergies = '[]'::jsonb AND conditions = '[]'::jsonb));

-- ── 3. Privileges (Sprint 41: the API is a login in dawabag_app only) ────────
GRANT SELECT, INSERT, UPDATE, DELETE ON order_edits TO dawabag_app, dawabag_maintenance;
