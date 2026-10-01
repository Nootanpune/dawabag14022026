-- ─────────────────────────────────────────────────────────────────────────────
-- 12_sprint9_einvoice_returns.sql — Sprint 9 (e-invoicing, purchase returns)
-- Applied by the migration runner. Safe to re-run.
--
-- 1. Document numbers fit the 16-character limit (CGST Rule 46(b); IRP)
-- 2. E-invoices (IRN) for Dawabag's B2B invoices and credit notes (C-31)
-- 3. Purchase returns to suppliers (C-28 recalls, expiry, damage)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Document numbers: <prefix>/<FY as 2627>/<n, 5+ digits>, never over 16 ──
-- The series key and counter are unchanged, so numbering continues without a gap.
CREATE OR REPLACE FUNCTION next_invoice_number(p_series VARCHAR, p_prefix VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
  v_fy  VARCHAR(9);
  v_num INTEGER;
  v_out VARCHAR;
BEGIN
  v_fy := CASE
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
      THEN EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || RIGHT((EXTRACT(YEAR FROM CURRENT_DATE) + 1)::TEXT, 2)
    ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::TEXT || '-' || RIGHT(EXTRACT(YEAR FROM CURRENT_DATE)::TEXT, 2)
  END;
  INSERT INTO invoice_series (series_key, fy, prefix, last_number)
  VALUES (p_series, v_fy, p_prefix, 1)
  ON CONFLICT (series_key, fy) DO UPDATE SET last_number = invoice_series.last_number + 1
  RETURNING last_number INTO v_num;
  v_out := p_prefix || '/' || SUBSTRING(v_fy, 3, 2) || RIGHT(v_fy, 2) || '/' || LPAD(v_num::TEXT, 5, '0');
  IF LENGTH(v_out) > 16 THEN
    RAISE EXCEPTION 'Document number % is longer than 16 characters (CGST Rule 46); shorten the series prefix %', v_out, p_prefix;
  END IF;
  RETURN v_out;
END;
$$ LANGUAGE plpgsql;

-- ── 2. E-invoices ────────────────────────────────────────────────────────────
-- The v2 package's per-order e_invoices table was never used; one authority only.
DO $$ BEGIN
  IF to_regclass('e_invoices') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM e_invoices) THEN
    DROP TABLE e_invoices;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS einvoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type        VARCHAR(3) NOT NULL CHECK (doc_type IN ('INV', 'CRN')),
  doc_number      VARCHAR(16) NOT NULL,
  shipment_id     UUID NOT NULL REFERENCES order_shipments(id),
  credit_note_id  UUID UNIQUE REFERENCES credit_notes(id),
  status          VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generated', 'failed', 'cancelled')),
  irn             VARCHAR(64) UNIQUE,
  ack_no          VARCHAR(20),
  ack_date        TIMESTAMPTZ,
  signed_qr       TEXT,
  signed_invoice  TEXT,
  error_code      VARCHAR(20),
  error_message   TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_at    TIMESTAMPTZ,
  UNIQUE (doc_type, doc_number),
  CHECK ((doc_type = 'CRN') = (credit_note_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_einvoice_one_inv ON einvoices(shipment_id) WHERE doc_type = 'INV';
CREATE INDEX IF NOT EXISTS idx_einvoice_open ON einvoices(status, last_attempt_at) WHERE status IN ('pending', 'failed');

-- Once the IRP has registered a document its IRN and signed data never change (C-31, C-34)
CREATE OR REPLACE FUNCTION dawabag_einvoice_final() RETURNS trigger AS $$
BEGIN
  IF current_setting('dawabag.maintenance', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
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
DROP TRIGGER IF EXISTS einvoices_final ON einvoices;
CREATE TRIGGER einvoices_final BEFORE UPDATE OR DELETE ON einvoices FOR EACH ROW EXECUTE FUNCTION dawabag_einvoice_final();

-- ── 3. Purchase returns ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_returns (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_no                  VARCHAR(16) NOT NULL UNIQUE,
  vendor_id                  UUID NOT NULL REFERENCES vendors(id),
  reason                     VARCHAR(20) NOT NULL CHECK (reason IN ('recalled', 'expired', 'near_expiry', 'damaged', 'excess', 'wrong_item')),
  status                     VARCHAR(12) NOT NULL DEFAULT 'requested'
                             CHECK (status IN ('requested', 'approved', 'dispatched', 'settled', 'rejected')),
  notes                      TEXT NOT NULL,
  taxable_paise              BIGINT NOT NULL,
  cgst_paise                 BIGINT NOT NULL DEFAULT 0,
  sgst_paise                 BIGINT NOT NULL DEFAULT 0,
  igst_paise                 BIGINT NOT NULL DEFAULT 0,
  total_paise                BIGINT NOT NULL,
  requested_by               UUID NOT NULL REFERENCES users(id),
  approved_by                UUID REFERENCES users(id),
  decided_at                 TIMESTAMPTZ,
  decision_notes             TEXT,
  dispatched_by              UUID REFERENCES users(id),
  dispatched_at              TIMESTAMPTZ,
  dispatch_reference         VARCHAR(100),          -- e-way bill / LR / courier AWB
  supplier_credit_note_no    VARCHAR(60),
  supplier_credit_note_date  DATE,
  supplier_credit_paise      BIGINT,
  settled_by                 UUID REFERENCES users(id),
  settled_at                 TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (approved_by IS NULL OR approved_by <> requested_by)
);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_status ON purchase_returns(status, created_at);

CREATE TABLE IF NOT EXISTS purchase_return_lines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id        UUID NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  batch_id         UUID NOT NULL REFERENCES inventory_batches(id),
  product_id       UUID NOT NULL REFERENCES products(id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost_paise  INTEGER NOT NULL CHECK (unit_cost_paise >= 0),
  gst_rate         INTEGER NOT NULL,
  taxable_paise    INTEGER NOT NULL,
  gst_paise        INTEGER NOT NULL,
  adjustment_id    UUID REFERENCES stock_adjustments(id),
  UNIQUE (return_id, batch_id)
);

INSERT INTO app_settings (key, value, description) VALUES
  ('einvoice.enabled', 'false',
   'Generate e-invoices (IRN) for Dawabag''s B2B invoices and credit notes. Turn on once aggregate turnover crosses the e-invoicing threshold (C-31)')
ON CONFLICT (key) DO NOTHING;
