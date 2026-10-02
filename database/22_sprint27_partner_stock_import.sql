-- Sprint 27 — partner stock import (format-agnostic).
-- A partner pharmacy uploads a batch-wise stock export from its billing software
-- (first partner: Nootan Pharmaceuticals, MediVision Platinum by Allied Softtech).
-- The file is read in memory on the server and never stored; only the parsed rows
-- are kept here (server is the single source of truth). Applying an import writes
-- the partner's OWN stock ledger (partner_inventory) exactly as the listing stock
-- editor does — never Dawabag's batches, never another partner's (owner decision
-- 1 Oct 2026; C-05, C-25, C-28). Re-runnable.

CREATE TABLE IF NOT EXISTS partner_stock_imports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id          UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  file_name           VARCHAR(255) NOT NULL,
  file_size           INTEGER NOT NULL,
  file_sha256         CHAR(64) NOT NULL,
  file_kind           VARCHAR(10) NOT NULL,              -- xlsx | csv | html
  sheet_name          VARCHAR(100),
  source_software     VARCHAR(100),                      -- e.g. 'MediVision Platinum (Allied Softtech)'
  header_row          INTEGER NOT NULL,                  -- 1-based row number in the sheet
  headers             JSONB NOT NULL,                    -- ["Product name", "Unit", ...]
  mapping             JSONB NOT NULL DEFAULT '{}',       -- {"item_name": 0, "batch_number": 6, ...} (column index)
  mapping_source      VARCHAR(20) NOT NULL DEFAULT 'suggested'
    CHECK (mapping_source IN ('suggested', 'preset', 'saved', 'confirmed')),
  mapping_confirmed_at TIMESTAMPTZ,
  row_count           INTEGER NOT NULL DEFAULT 0,
  summary             JSONB,                             -- counts after the last check (matched / needs review / problems)
  status              VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'applied', 'cancelled')),
  result              JSONB,                             -- what apply did (counts and skipped reasons)
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  evaluated_at        TIMESTAMPTZ,
  applied_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  applied_at          TIMESTAMPTZ,
  cancelled_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_psi_partner ON partner_stock_imports(partner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS partner_stock_import_rows (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id             UUID NOT NULL REFERENCES partner_stock_imports(id) ON DELETE CASCADE,
  row_number            INTEGER NOT NULL,                -- row number in the sheet (1-based)
  raw                   JSONB NOT NULL,                  -- cells as text, in column order
  parsed                JSONB,                           -- mapped values (name, batch, expiry, qty, paise ...)
  item_key              VARCHAR(400),                    -- partner's identity for the item (code or name|unit|company)
  product_id            UUID REFERENCES products(id),
  match_method          VARCHAR(20)
    CHECK (match_method IS NULL OR match_method IN ('item_link', 'listing', 'catalogue', 'manual')),
  status                VARCHAR(20) NOT NULL DEFAULT 'needs_review'
    CHECK (status IN ('matched', 'needs_review', 'problem', 'skipped')),
  problems              JSONB NOT NULL DEFAULT '[]',
  warnings              JSONB NOT NULL DEFAULT '[]',
  candidates            JSONB NOT NULL DEFAULT '[]',     -- suggested catalogue products for review
  new_product_requested BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (import_id, row_number)
);
CREATE INDEX IF NOT EXISTS idx_psir_import_status ON partner_stock_import_rows(import_id, status, row_number);

-- The partner's confirmed column choices, reused when a later file has the same headings
CREATE TABLE IF NOT EXISTS partner_import_mappings (
  partner_id   UUID PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
  headers      JSONB NOT NULL,                           -- normalised headings of the file it was made for
  mapping      JSONB NOT NULL,                           -- {"item_name": "product name", ...} (normalised heading)
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- "This item in my software is this Dawabag product." Made when the partner (or an
-- admin resolving a new-product request) picks the product, and learnt from exact
-- matches on apply. Look-alike names are never linked automatically.
CREATE TABLE IF NOT EXISTS partner_item_links (
  partner_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  item_key     VARCHAR(400) NOT NULL,
  product_id   UUID NOT NULL REFERENCES products(id),
  item_label   VARCHAR(500),                             -- what the partner's file called it
  source       VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto', 'admin')),
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (partner_id, item_key)
);

-- Items a partner stocks that are not in Dawabag's catalogue yet. An admin creates
-- the product (schedule, generic name, HSN, cold chain and copy set and reviewed by
-- the pharmacist, C-19; Schedule X / NDPS never, C-10) and links the request; the
-- partner's next import then matches it through partner_item_links.
CREATE TABLE IF NOT EXISTS partner_product_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id      UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  import_id       UUID REFERENCES partner_stock_imports(id) ON DELETE SET NULL,
  item_key        VARCHAR(400) NOT NULL,
  item_name       VARCHAR(500) NOT NULL,
  pack            VARCHAR(100),
  manufacturer    VARCHAR(255),
  item_code       VARCHAR(100),
  hsn_code        VARCHAR(20),
  gst_rate        NUMERIC(5,2),
  mrp_paise       INTEGER,
  ptr_paise       INTEGER,
  status          VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'linked', 'rejected')),
  product_id      UUID REFERENCES products(id),
  requested_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ppr_open_item
  ON partner_product_requests(partner_id, item_key) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_ppr_status ON partner_product_requests(status, requested_at);
