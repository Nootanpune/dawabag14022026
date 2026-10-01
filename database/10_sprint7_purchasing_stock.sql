-- ─────────────────────────────────────────────────────────────────────────────
-- 10_sprint7_purchasing_stock.sql — Sprint 7 (purchasing and stock control)
-- Applied by the migration runner. Safe to re-run.
--
-- 1. Purchase orders: lifecycle, received quantities
-- 2. Goods receipts (GRN) against supplier invoices — the purchase register
-- 3. Batches carry the printed MRP and their receipt line (C-16)
-- 4. Stock adjustments with two-person approval, and the destruction register
-- 5. Stock counts
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Purchase orders ───────────────────────────────────────────────────────
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN ('draft', 'sent', 'confirmed', 'partially_received', 'received', 'closed', 'cancelled'));
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_reason  TEXT,
  ADD COLUMN IF NOT EXISTS gst_paise      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE po_items
  ADD COLUMN IF NOT EXISTS received_qty   INTEGER NOT NULL DEFAULT 0 CHECK (received_qty >= 0);

-- ── 2. Goods receipts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goods_receipts (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_number             VARCHAR(40) NOT NULL UNIQUE,
  po_id                  UUID REFERENCES purchase_orders(id),
  vendor_id              UUID NOT NULL REFERENCES vendors(id),
  supplier_invoice_no    VARCHAR(60) NOT NULL,
  supplier_invoice_date  DATE NOT NULL,
  supplier_gstin         VARCHAR(15),
  supplier_dl_no         VARCHAR(100),            -- licence as checked at receipt (Drugs Rules purchase record)
  taxable_paise          BIGINT NOT NULL,
  cgst_paise             BIGINT NOT NULL DEFAULT 0,
  sgst_paise             BIGINT NOT NULL DEFAULT 0,
  igst_paise             BIGINT NOT NULL DEFAULT 0,
  total_paise            BIGINT NOT NULL,
  received_by            UUID NOT NULL REFERENCES users(id),
  checked_by_pharmacist  UUID REFERENCES users(id),
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (vendor_id, supplier_invoice_no)
);

CREATE TABLE IF NOT EXISTS grn_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id             UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  po_item_id         UUID REFERENCES po_items(id),
  product_id         UUID NOT NULL REFERENCES products(id),
  batch_id           UUID,                         -- FK below
  batch_number       VARCHAR(100) NOT NULL,
  expiry_date        DATE NOT NULL,
  manufactured_date  DATE,
  quantity           INTEGER NOT NULL CHECK (quantity > 0),
  free_quantity      INTEGER NOT NULL DEFAULT 0 CHECK (free_quantity >= 0),
  unit_cost_paise    INTEGER NOT NULL CHECK (unit_cost_paise >= 0),
  printed_mrp_paise  INTEGER NOT NULL CHECK (printed_mrp_paise > 0),
  gst_rate           INTEGER NOT NULL,
  taxable_paise      INTEGER NOT NULL,
  gst_paise          INTEGER NOT NULL
);

-- ── 3. Batches ───────────────────────────────────────────────────────────────
ALTER TABLE inventory_batches
  ADD COLUMN IF NOT EXISTS printed_mrp_paise INTEGER,
  ADD COLUMN IF NOT EXISTS grn_line_id       UUID REFERENCES grn_lines(id);
DO $$ BEGIN
  ALTER TABLE grn_lines ADD CONSTRAINT grn_lines_batch_fk FOREIGN KEY (batch_id) REFERENCES inventory_batches(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 4. Stock adjustments and the destruction register ────────────────────────
CREATE SEQUENCE IF NOT EXISTS stock_adjustment_seq;
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_no       VARCHAR(20) NOT NULL UNIQUE,
  batch_id            UUID NOT NULL REFERENCES inventory_batches(id),
  quantity_delta      INTEGER NOT NULL CHECK (quantity_delta <> 0),
  reason              VARCHAR(25) NOT NULL CHECK (reason IN (
                        'damaged', 'expired', 'recalled', 'count_variance', 'theft_loss', 'found', 'return_to_supplier', 'sample')),
  notes               TEXT NOT NULL,
  status              VARCHAR(20) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'rejected')),
  requested_by        UUID REFERENCES users(id),             -- NULL = raised by the expiry job
  approved_by         UUID REFERENCES users(id),
  decided_at          TIMESTAMPTZ,
  decision_notes      TEXT,
  stock_count_id      UUID,
  -- Destruction of expired / damaged / recalled goods (Drugs Rules; C-28, C-34)
  disposal_method     VARCHAR(30) CHECK (disposal_method IN ('incineration', 'authorised_vendor', 'returned_to_manufacturer')),
  disposal_reference  VARCHAR(100),
  disposed_at         TIMESTAMPTZ,
  disposal_witness    VARCHAR(150),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (approved_by IS NULL OR requested_by IS NULL OR approved_by <> requested_by)
);
CREATE INDEX IF NOT EXISTS idx_stock_adj_status ON stock_adjustments(status, created_at);
-- One open expiry write-off per batch (the daily job must not repeat it)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_adj_expired_once ON stock_adjustments(batch_id)
  WHERE reason = 'expired' AND status <> 'rejected';

-- ── 5. Stock counts ──────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS stock_count_seq;
CREATE TABLE IF NOT EXISTS stock_counts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_no      VARCHAR(20) NOT NULL UNIQUE,
  scope         TEXT NOT NULL,                    -- e.g. 'Rack A' or 'All Schedule H'
  status        VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'submitted', 'approved', 'cancelled')),
  counted_by    UUID NOT NULL REFERENCES users(id),
  approved_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at  TIMESTAMPTZ,
  approved_at   TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS stock_count_lines (
  stock_count_id UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  batch_id       UUID NOT NULL REFERENCES inventory_batches(id),
  system_qty     INTEGER NOT NULL,
  counted_qty    INTEGER CHECK (counted_qty >= 0),
  PRIMARY KEY (stock_count_id, batch_id)
);
DO $$ BEGIN
  ALTER TABLE stock_adjustments ADD CONSTRAINT stock_adj_count_fk FOREIGN KEY (stock_count_id) REFERENCES stock_counts(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Receipts and approved adjustments are final records (C-34)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['goods_receipts', 'grn_lines'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_final ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_final BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION dawabag_records_are_final()', t, t);
  END LOOP;
END $$;

INSERT INTO app_settings (key, value, description) VALUES
  ('purchasing.min_shelf_life_days', '180',
   'Stock with fewer days to expiry than this is refused at goods receipt'),
  ('stock.near_expiry_days', '90',
   'Batches expiring within this many days appear on the near-expiry watch list')
ON CONFLICT (key) DO NOTHING;
