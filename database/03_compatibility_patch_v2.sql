-- ============================================================
-- DAWABAG — COMPATIBILITY PATCH MIGRATION v2.0
-- Run AFTER migration.sql and kyc_migration.sql
-- Fixes all 8 critical gaps identified in compatibility audit
-- ============================================================

-- ── GAP-01: Customer type + B2B price fields ──────────────────────────────────

-- Ensure customer_type is in users table (may already be from kyc_migration)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS customer_type VARCHAR(30) DEFAULT 'customer'
    CHECK (customer_type IN (
      'customer','b2b_retailer','b2b_wholesaler','doc_hospital',
      'doctor','pharmacist_rx','pharmacist_pack','delivery','admin','super_admin'
    ));

-- B2B price fields on products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS ptr_price_paise           INTEGER,  -- Price to Retailer
  ADD COLUMN IF NOT EXISTS pts_price_paise           INTEGER,  -- Price to Stockist (Wholesaler)
  ADD COLUMN IF NOT EXISTS institutional_price_paise INTEGER,  -- Doctor / Hospital price
  ADD COLUMN IF NOT EXISTS retailer_pack_desc        VARCHAR(100), -- e.g. "Box of 10 strips"
  ADD COLUMN IF NOT EXISTS wholesaler_pack_desc      VARCHAR(100); -- e.g. "Carton of 100 strips"

-- Default B2B prices to offer_price_paise if not set (admin must update)
UPDATE products
  SET ptr_price_paise = ROUND(offer_price_paise * 0.85),
      pts_price_paise = ROUND(offer_price_paise * 0.78),
      institutional_price_paise = ROUND(offer_price_paise * 0.90)
  WHERE ptr_price_paise IS NULL;

-- ── GAP-02: Minimum order quantity for B2B ────────────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS min_order_qty_retailer    SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_order_qty_wholesaler  SMALLINT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_qty_per_order_retailer INTEGER,   -- NULL = no cap
  ADD COLUMN IF NOT EXISTS max_qty_per_order_wholesaler INTEGER; -- NULL = no cap

-- ── GAP-03 + GAP-04: Vendor approval + rating ────────────────────────────────

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS approval_status    VARCHAR(20) DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected','suspended')),
  ADD COLUMN IF NOT EXISTS kyc_status         VARCHAR(20) DEFAULT 'pending_kyc'
    CHECK (kyc_status IN ('pending_kyc','approved','rejected','suspended')),
  ADD COLUMN IF NOT EXISTS drug_license_type  VARCHAR(20)
    CHECK (drug_license_type IN ('dl20','dl21','dl20c','dl21c','none')),
  ADD COLUMN IF NOT EXISTS drug_license_expiry DATE,
  ADD COLUMN IF NOT EXISTS drug_license_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approved_by        UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approved_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason   TEXT,
  -- Rating and performance
  ADD COLUMN IF NOT EXISTS vendor_rating      DECIMAL(3,2) DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS total_orders_fulfilled INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_orders_received  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS on_time_dispatch_pct   DECIMAL(5,2) DEFAULT 100.00,
  ADD COLUMN IF NOT EXISTS return_rate_pct        DECIMAL(5,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS avg_dispatch_hours     DECIMAL(5,1) DEFAULT 24.0,
  ADD COLUMN IF NOT EXISTS last_rating_updated_at TIMESTAMPTZ,
  -- Location (for nearest-partner allocation)
  ADD COLUMN IF NOT EXISTS pincode        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS city           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS state          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS address_line1  VARCHAR(500),
  ADD COLUMN IF NOT EXISTS latitude       DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS longitude      DECIMAL(9,6),
  -- Partner type
  ADD COLUMN IF NOT EXISTS vendor_type    VARCHAR(20) DEFAULT 'supplier'
    CHECK (vendor_type IN ('supplier','marketplace_partner','both'));

CREATE INDEX IF NOT EXISTS idx_vendors_approval ON vendors(approval_status)
  WHERE approval_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_vendors_pincode ON vendors(pincode)
  WHERE approval_status = 'approved';

-- Vendor rating history (for trending)
CREATE TABLE IF NOT EXISTS vendor_performance_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id       UUID NOT NULL REFERENCES vendors(id),
  period_month    DATE NOT NULL,  -- First day of the month: '2025-01-01'
  orders_received INTEGER DEFAULT 0,
  orders_fulfilled INTEGER DEFAULT 0,
  orders_returned  INTEGER DEFAULT 0,
  orders_late      INTEGER DEFAULT 0,
  avg_dispatch_hrs DECIMAL(5,1),
  calculated_rating DECIMAL(3,2),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (vendor_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_vperf_vendor_month ON vendor_performance_history(vendor_id, period_month);

-- ── GAP-05: Marketplace / Partner inventory tables ────────────────────────────

-- Partner submitted products (one row per product per partner, per submission)
CREATE TABLE IF NOT EXISTS partner_products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  product_id        UUID REFERENCES products(id), -- NULL until mapped to Dawabag's product master
  submission_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  review_id         VARCHAR(20) UNIQUE,     -- e.g. REV-2025-0001
  -- Product details as submitted by partner
  medicine_name     VARCHAR(500) NOT NULL,
  generic_name      VARCHAR(500),
  partner_sku       VARCHAR(100),
  drug_schedule     VARCHAR(20),
  hsn_code          VARCHAR(20),
  gst_rate          INTEGER,
  mrp_paise         INTEGER,
  supply_price_paise INTEGER NOT NULL,      -- What partner bills Dawabag
  cold_chain        BOOLEAN DEFAULT FALSE,
  storage_condition VARCHAR(50),
  unit_weight_grams INTEGER,
  min_order_qty     INTEGER DEFAULT 1,
  prescription_required BOOLEAN DEFAULT FALSE,
  -- Review
  reviewed_by       UUID REFERENCES users(id),
  reviewed_at       TIMESTAMPTZ,
  approval_status   VARCHAR(20) DEFAULT 'pending'
    CHECK (approval_status IN ('pending','approved','rejected','on_hold','more_info_needed')),
  rejection_reason_code VARCHAR(10),         -- REJ-01 through REJ-14
  rejection_details TEXT,
  -- Portal listing
  listing_status    VARCHAR(20) DEFAULT 'not_listed'
    CHECK (listing_status IN ('not_listed','pending','live','delisted','suspended')),
  posted_at         TIMESTAMPTZ,
  posted_by         UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pp_partner     ON partner_products(partner_id);
CREATE INDEX IF NOT EXISTS idx_pp_product     ON partner_products(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pp_approval    ON partner_products(approval_status) WHERE approval_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_pp_listing     ON partner_products(listing_status) WHERE listing_status = 'live';

-- Partner stock (batch-level inventory at partner's premises)
CREATE TABLE IF NOT EXISTS partner_inventory (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_product_id    UUID NOT NULL REFERENCES partner_products(id) ON DELETE CASCADE,
  partner_id            UUID NOT NULL REFERENCES vendors(id),
  batch_number          VARCHAR(100) NOT NULL,
  qty_available         INTEGER NOT NULL DEFAULT 0,
  qty_reserved          INTEGER NOT NULL DEFAULT 0,
  expiry_date           DATE NOT NULL,
  manufactured_date     DATE,
  purchase_price_paise  INTEGER,
  storage_location      VARCHAR(100),
  cold_chain_confirmed  BOOLEAN DEFAULT FALSE,
  last_updated_at       TIMESTAMPTZ DEFAULT NOW(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (partner_product_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_pinv_partner       ON partner_inventory(partner_id);
CREATE INDEX IF NOT EXISTS idx_pinv_expiry        ON partner_inventory(partner_product_id, expiry_date ASC);
CREATE INDEX IF NOT EXISTS idx_pinv_available     ON partner_inventory(partner_product_id)
  WHERE qty_available > qty_reserved;

-- ── GAP-05 continued: Order allocation + partner order link ──────────────────

-- Which partner is fulfilling which order items
CREATE TABLE IF NOT EXISTS partner_order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders(id),
  order_item_id     UUID NOT NULL REFERENCES order_items(id),
  partner_id        UUID NOT NULL REFERENCES vendors(id),
  partner_product_id UUID REFERENCES partner_products(id),
  partner_inv_id    UUID REFERENCES partner_inventory(id),
  -- Allocation details
  allocated_qty     INTEGER NOT NULL,
  supply_price_paise INTEGER NOT NULL,
  allocation_reason VARCHAR(200),  -- e.g. "Nearest partner 3.2km, rating 4.8, stock 500"
  -- Commission
  commission_pct    DECIMAL(5,2),
  commission_paise  INTEGER,       -- Computed at settlement
  finding_fee_paise INTEGER,
  net_payable_paise INTEGER,       -- supply_price - commission - finding_fee
  -- Fulfilment tracking
  dispatch_status   VARCHAR(20) DEFAULT 'pending'
    CHECK (dispatch_status IN ('pending','dispatched','delivered','returned','cancelled')),
  dispatched_at     TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  dispatch_hours    DECIMAL(5,1),  -- Actual hours taken to dispatch
  -- Settlement
  settlement_batch_id UUID,
  settled_at        TIMESTAMPTZ,
  partner_invoice_no VARCHAR(50),  -- Partner's B2B invoice number to Dawabag
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poi_order    ON partner_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_poi_partner  ON partner_order_items(partner_id);
CREATE INDEX IF NOT EXISTS idx_poi_settlement ON partner_order_items(settlement_batch_id)
  WHERE settlement_batch_id IS NOT NULL;

-- Settlement batches (monthly payout to each partner)
CREATE TABLE IF NOT EXISTS settlement_batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_ref         VARCHAR(30) UNIQUE NOT NULL,  -- e.g. SETL-2025-01-001
  partner_id        UUID NOT NULL REFERENCES vendors(id),
  period_from       DATE NOT NULL,
  period_to         DATE NOT NULL,
  total_orders      INTEGER DEFAULT 0,
  gross_sale_value_paise   BIGINT DEFAULT 0,  -- What Dawabag collected from customers
  partner_invoice_amount_paise BIGINT DEFAULT 0,  -- What partner billed Dawabag
  commission_paise  BIGINT DEFAULT 0,
  finding_fee_paise BIGINT DEFAULT 0,
  return_deductions_paise BIGINT DEFAULT 0,
  late_penalty_paise BIGINT DEFAULT 0,
  other_deductions_paise BIGINT DEFAULT 0,
  net_payable_paise BIGINT DEFAULT 0,  -- Computed
  payment_mode      VARCHAR(20),        -- NEFT/RTGS/UPI
  utr_reference     VARCHAR(50),
  paid_at           TIMESTAMPTZ,
  payment_status    VARCHAR(20) DEFAULT 'pending'
    CHECK (payment_status IN ('pending','processed','paid','disputed','on_hold')),
  partner_invoice_no DATE,
  notes             TEXT,
  created_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_settle_partner ON settlement_batches(partner_id);
CREATE INDEX IF NOT EXISTS idx_settle_status  ON settlement_batches(payment_status);

-- Commission rate master per partner
CREATE TABLE IF NOT EXISTS partner_commission_rates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          UUID NOT NULL REFERENCES vendors(id) UNIQUE,
  commission_pct      DECIMAL(5,2) NOT NULL DEFAULT 8.00,
  finding_fee_paise   INTEGER NOT NULL DEFAULT 1500,  -- Rs.15 = 1500 paise
  settlement_cycle_days INTEGER DEFAULT 7,            -- T+7
  performance_bonus_pct DECIMAL(5,2) DEFAULT 0,
  bonus_target_orders INTEGER DEFAULT 100,
  late_penalty_per_day_paise INTEGER DEFAULT 5000,    -- Rs.50/day
  return_policy       VARCHAR(50) DEFAULT 'full_refund',
  effective_from      DATE DEFAULT CURRENT_DATE,
  effective_until     DATE,
  agreed_by_admin     UUID REFERENCES users(id),
  agreed_at           TIMESTAMPTZ DEFAULT NOW(),
  notes               TEXT
);

-- ── GAP-06: e-Invoice migration ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS e_invoices (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID NOT NULL REFERENCES orders(id),
  irn                  VARCHAR(64) UNIQUE,
  ack_no               VARCHAR(20),
  ack_dt               VARCHAR(30),
  irp_name             VARCHAR(20) DEFAULT 'IRIS_IRP6',
  qr_code              TEXT,
  signed_invoice       JSONB,
  irn_status           VARCHAR(20) DEFAULT 'pending'
    CHECK (irn_status IN ('pending','active','cancelled','failed','not_applicable')),
  cancellation_reason  VARCHAR(10),
  cancelled_at         TIMESTAMPTZ,
  invoice_pdf_s3_key   VARCHAR(500),
  irp_raw_request      JSONB,
  irp_raw_response     JSONB,
  retry_count          SMALLINT DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_einvoice_order   ON e_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_einvoice_irn     ON e_invoices(irn) WHERE irn IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_einvoice_pending ON e_invoices(irn_status, retry_count)
  WHERE irn_status IN ('pending','failed');

-- Invoice number sequence (financial year 2025-26)
-- IMPORTANT: Create new sequence at start of each financial year (April 1)
CREATE SEQUENCE IF NOT EXISTS invoice_seq_2526 START 1 INCREMENT 1;

-- Function to generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number() RETURNS VARCHAR(30) AS $$
DECLARE
  fy VARCHAR(10);
  seq_val BIGINT;
BEGIN
  fy := CASE
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
      THEN EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || (EXTRACT(YEAR FROM CURRENT_DATE) + 1)::TEXT
    ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::TEXT || '-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT
  END;
  seq_val := nextval('invoice_seq_2526');
  RETURN 'DWB/' || fy || '/' || LPAD(seq_val::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS irn              VARCHAR(64),
  ADD COLUMN IF NOT EXISTS invoice_number   VARCHAR(30) UNIQUE DEFAULT generate_invoice_number(),
  ADD COLUMN IF NOT EXISTS e_invoice_status VARCHAR(20) DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS payment_terms    VARCHAR(20) DEFAULT 'prepaid'
    CHECK (payment_terms IN ('prepaid','cad','net_7','net_15','net_30','net_45','net_60','postpaid')),
  ADD COLUMN IF NOT EXISTS credit_due_date  DATE,
  ADD COLUMN IF NOT EXISTS buyer_gstin      VARCHAR(15),
  ADD COLUMN IF NOT EXISTS buyer_pan        VARCHAR(10);

-- ── GAP-08: Reorder level / minimum stock alert ───────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS reorder_level_qty     INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS reorder_qty           INTEGER DEFAULT 100,
  ADD COLUMN IF NOT EXISTS preferred_vendor_id   UUID REFERENCES vendors(id);

CREATE TABLE IF NOT EXISTS low_stock_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id),
  current_qty     INTEGER NOT NULL,
  reorder_level   INTEGER NOT NULL,
  alert_sent_at   TIMESTAMPTZ DEFAULT NOW(),
  alert_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  po_raised       BOOLEAN DEFAULT FALSE,
  po_id           UUID REFERENCES purchase_orders(id),
  resolved_at     TIMESTAMPTZ,
  UNIQUE (product_id, alert_date)  -- One alert per product per day max
);

CREATE INDEX IF NOT EXISTS idx_low_stock_product ON low_stock_alerts(product_id)
  WHERE resolved_at IS NULL;

-- ── GAP-03: Audit log (ensure columns exist) ──────────────────────────────────

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS old_value   JSONB,
  ADD COLUMN IF NOT EXISTS new_value   JSONB,
  ADD COLUMN IF NOT EXISTS ip_address  INET,
  ADD COLUMN IF NOT EXISTS user_agent  TEXT;

-- ── SUMMARY VIEW: low stock dashboard ────────────────────────────────────────

CREATE OR REPLACE VIEW v_low_stock AS
SELECT
  p.id, p.name, p.sku, p.category, p.reorder_level_qty,
  COALESCE(SUM(b.quantity_available - b.quantity_reserved), 0) AS current_stock,
  p.preferred_vendor_id,
  v.name AS preferred_vendor_name,
  CASE
    WHEN COALESCE(SUM(b.quantity_available - b.quantity_reserved), 0) = 0 THEN 'OUT OF STOCK'
    WHEN COALESCE(SUM(b.quantity_available - b.quantity_reserved), 0) <= p.reorder_level_qty THEN 'REORDER NOW'
    WHEN COALESCE(SUM(b.quantity_available - b.quantity_reserved), 0) <= p.reorder_level_qty * 1.5 THEN 'LOW STOCK'
    ELSE 'OK'
  END AS stock_status
FROM products p
LEFT JOIN inventory_batches b ON b.product_id = p.id
  AND b.expiry_date > CURRENT_DATE + 30
LEFT JOIN vendors v ON p.preferred_vendor_id = v.id
WHERE p.is_active = TRUE AND p.deleted_at IS NULL
GROUP BY p.id, v.name
ORDER BY current_stock ASC;

-- ── SUMMARY VIEW: partner order allocation (read-only for reporting) ──────────

CREATE OR REPLACE VIEW v_partner_allocation_candidates AS
SELECT
  v.id AS partner_id,
  v.name AS partner_name,
  v.pincode AS partner_pincode,
  v.vendor_rating,
  v.on_time_dispatch_pct,
  v.return_rate_pct,
  pp.product_id,
  pp.id AS partner_product_id,
  pp.supply_price_paise,
  pp.medicine_name,
  COALESCE(SUM(pi.qty_available - pi.qty_reserved), 0) AS available_qty,
  MIN(pi.expiry_date) AS nearest_expiry
FROM vendors v
JOIN partner_products pp ON pp.partner_id = v.id AND pp.listing_status = 'live'
JOIN partner_inventory pi ON pi.partner_product_id = pp.id
  AND pi.qty_available > pi.qty_reserved
  AND pi.expiry_date > CURRENT_DATE + INTERVAL '180 days'  -- min 6 months expiry
WHERE v.approval_status = 'approved'
  AND v.vendor_type IN ('marketplace_partner','both')
GROUP BY v.id, v.name, v.pincode, v.vendor_rating, v.on_time_dispatch_pct,
         v.return_rate_pct, pp.product_id, pp.id, pp.supply_price_paise, pp.medicine_name
HAVING COALESCE(SUM(pi.qty_available - pi.qty_reserved), 0) > 0;

-- ── Final: Update migration tracking ─────────────────────────────────────────

COMMENT ON TABLE partner_products IS 'Dawabag marketplace — partner product submissions and approval log';
COMMENT ON TABLE partner_inventory IS 'Dawabag marketplace — batch-level stock held at partner premises';
COMMENT ON TABLE partner_order_items IS 'Dawabag marketplace — which partner fulfilled which order item';
COMMENT ON TABLE settlement_batches IS 'Dawabag marketplace — monthly commission settlement per partner';
COMMENT ON TABLE partner_commission_rates IS 'Dawabag marketplace — agreed commission rates per partner';
COMMENT ON TABLE vendor_performance_history IS 'Monthly performance metrics and rating for each vendor / partner';
COMMENT ON TABLE low_stock_alerts IS 'Alert log when product stock falls below reorder level';
COMMENT ON TABLE e_invoices IS 'GST e-invoice IRN tracking — IRIS IRP6 integration';
