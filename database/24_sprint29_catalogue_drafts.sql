-- ============================================================
-- Sprint 29 — draft catalogue products from partner requests
--   A partner's stock file can name hundreds of items Dawabag does not list yet
--   (partner_product_requests, Sprint 27). An admin turns many requests into
--   DRAFT products at once, pre-filled only with what the file said (name, pack,
--   company code, GST %, MRP). A pharmacist completes each draft (schedule,
--   generic name, strength, form, cold chain, HSN, category, copy) and approves
--   it through the same copy review as any product (C-19).
--
--   A draft is never active, never sellable and never shown to buyers: the
--   database refuses an active product that is not 'live' (guard below), and
--   every buyer path already reads only active products (C-10, C-19).
--   Approving a draft as Schedule X / NDPS makes it 'not_listed' — it can never
--   become active (C-10).
-- Re-runnable (IF NOT EXISTS / DROP ... IF EXISTS).
-- ============================================================

-- ── 1. Catalogue state on products ───────────────────────────────────────────
--   live        an ordinary product (every product before Sprint 29)
--   draft       created from partner requests, waiting for the pharmacist
--   not_listed  approved as Schedule X / NDPS: kept for the record, never sold (C-10)
--   rejected    "not a medicine we list"; soft-deleted
ALTER TABLE products ADD COLUMN IF NOT EXISTS catalogue_state VARCHAR(20) NOT NULL DEFAULT 'live';
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_catalogue_state_check;
ALTER TABLE products ADD CONSTRAINT products_catalogue_state_check
  CHECK (catalogue_state IN ('live', 'draft', 'not_listed', 'rejected'));

-- Only a live product may be active (visible, searchable, sellable, allocatable)
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_active_only_live;
ALTER TABLE products ADD CONSTRAINT products_active_only_live
  CHECK (NOT is_active OR catalogue_state = 'live');

-- Clinical details a draft has not had decided yet are blank, never guessed:
-- schedule, category and GST may be empty only while it is a draft (or rejected)
ALTER TABLE products ALTER COLUMN drug_schedule DROP NOT NULL;
ALTER TABLE products ALTER COLUMN category DROP NOT NULL;
ALTER TABLE products ALTER COLUMN gst_rate DROP NOT NULL;
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_decided_unless_draft;
ALTER TABLE products ADD CONSTRAINT products_decided_unless_draft
  CHECK (catalogue_state IN ('draft', 'rejected')
         OR (drug_schedule IS NOT NULL AND category IS NOT NULL AND gst_rate IS NOT NULL));

-- Strength and dosage form, decided by the pharmacist for drafts
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS strength    VARCHAR(100),   -- e.g. '650 mg', '250 mg/5 ml'
  ADD COLUMN IF NOT EXISTS dosage_form VARCHAR(50);    -- e.g. 'Tablet', 'Syrup'

CREATE INDEX IF NOT EXISTS idx_products_catalogue_state ON products(catalogue_state) WHERE catalogue_state <> 'live';

-- ── 2. The review queue ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS catalogue_drafts (
  product_id          UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  source              VARCHAR(30) NOT NULL DEFAULT 'partner_request',
  from_file           JSONB NOT NULL,           -- what the partner's file said (read-only in the queue)
  cold_chain_decided  BOOLEAN NOT NULL DEFAULT FALSE,   -- "No" must be chosen, not assumed (C-25)
  status              VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'approved', 'not_listed', 'rejected')),
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at          TIMESTAMPTZ,
  decision_note       TEXT
);
CREATE INDEX IF NOT EXISTS idx_catalogue_drafts_status ON catalogue_drafts(status, created_at);

-- ── 3. Requests turned into drafts ───────────────────────────────────────────
-- 'drafted': linked to a draft product that is not approved yet. The partner's
-- item link already points at the draft, so the next upload (or re-check) matches
-- it as soon as the pharmacist approves it.
ALTER TABLE partner_product_requests DROP CONSTRAINT IF EXISTS partner_product_requests_status_check;
ALTER TABLE partner_product_requests ADD CONSTRAINT partner_product_requests_status_check
  CHECK (status IN ('open', 'drafted', 'linked', 'rejected'));
DROP INDEX IF EXISTS idx_ppr_open_item;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ppr_active_item
  ON partner_product_requests(partner_id, item_key) WHERE status IN ('open', 'drafted');
