-- ============================================================
-- Sprint 37 — live stock feed from a partner's billing software (first: MediVision
-- by Allied Softtech, on the partner's own LAN server; a read-only connector there
-- pushes a FULL stock snapshot every 1–5 minutes over outbound HTTPS).
-- Owner decisions 2026-10-03 (docs/DECISIONS.md):
--   1. Quantity changes for products already linked and listed apply automatically.
--   2. New products, price / MRP changes, later expiry dates, refrigerated new batches
--      and new listings wait for a person (partner_feed_checks). Expired or
--      short-dated batches never go on sale (C-27).
--   3. Waiting items are flagged URGENT on the admin and partner portals and notified
--      once (not once per snapshot).
-- MediVision is the master of the partner's stock: Dawabag mirrors it, no second
-- authority. While a partner is in live mode the portal's stock editor and file apply
-- are refused (server-side).
-- Re-runnable (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS).
-- ============================================================

-- ── 1. Per-partner feed settings and state ──────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_stock_feeds (
  partner_id             UUID PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
  -- 'manual': portal / file uploads reviewed and applied by a person (Sprint 27 / 36)
  -- 'live':   snapshots from the connector apply quantities automatically (opt-in, admin)
  mode                   VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual', 'live')),
  -- No snapshot for this long → the partner's live stock is stale
  stale_after_minutes    INTEGER NOT NULL DEFAULT 15 CHECK (stale_after_minutes BETWEEN 2 AND 1440),
  -- Stale: 'hide' = offer none of it (default, safer); 'margin' = offer only what is
  -- above the safety margin (stale_margin_pct of the sellable quantity held back)
  stale_policy           VARCHAR(10) NOT NULL DEFAULT 'hide' CHECK (stale_policy IN ('hide', 'margin')),
  stale_margin_pct       INTEGER NOT NULL DEFAULT 50 CHECK (stale_margin_pct BETWEEN 1 AND 99),
  -- Minutes a partner may take to bill a dispatched shipment in its software
  -- (0 = bills before or when it presses Dispatch on Dawabag)
  billing_grace_minutes  INTEGER NOT NULL DEFAULT 0 CHECK (billing_grace_minutes BETWEEN 0 AND 240),
  -- The last snapshot accepted (connector's sequence and clock, clamped to receipt time)
  last_sequence          BIGINT,
  last_taken_at          TIMESTAMPTZ,
  last_received_at       TIMESTAMPTZ,
  last_sha256            CHAR(64),
  last_import_id         UUID REFERENCES partner_stock_imports(id) ON DELETE SET NULL,
  last_result            JSONB,
  -- Alerts sent once: stale (cleared by the next snapshot) and new items to check
  stale_alerted_at       TIMESTAMPTZ,
  checks_notified_at     TIMESTAMPTZ,
  mode_changed_at        TIMESTAMPTZ,
  updated_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_partner_stock_feeds_live ON partner_stock_feeds(mode) WHERE mode = 'live';

-- ── 2. Imports made by the live feed ─────────────────────────────────────────
ALTER TABLE partner_stock_imports ADD COLUMN IF NOT EXISTS mode VARCHAR(10) NOT NULL DEFAULT 'manual';
ALTER TABLE partner_stock_imports DROP CONSTRAINT IF EXISTS partner_stock_imports_mode_check;
ALTER TABLE partner_stock_imports ADD CONSTRAINT partner_stock_imports_mode_check CHECK (mode IN ('manual', 'live'));
ALTER TABLE partner_stock_imports ADD COLUMN IF NOT EXISTS feed_sequence BIGINT;
ALTER TABLE partner_stock_imports ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_psi_live ON partner_stock_imports(partner_id, created_at DESC) WHERE mode = 'live';

-- ── 3. Per batch: the printed MRP and the partner's rate last accepted ───────
-- A different value in the feed is a price change that waits for a person.
ALTER TABLE partner_inventory ADD COLUMN IF NOT EXISTS mrp_paise INTEGER;
ALTER TABLE partner_inventory ADD COLUMN IF NOT EXISTS sale_rate_paise INTEGER;
ALTER TABLE partner_inventory ADD COLUMN IF NOT EXISTS feed_quantity INTEGER;          -- packs in the last snapshot
ALTER TABLE partner_inventory ADD COLUMN IF NOT EXISTS feed_updated_at TIMESTAMPTZ;

-- ── 4. What waits for a person ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_feed_checks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id            UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  kind                  VARCHAR(24) NOT NULL CHECK (kind IN (
                          'new_product',        -- not linked to a Dawabag product
                          'new_listing',        -- linked, but the partner does not list it yet (declarations)
                          'cold_chain_batch',   -- new batch of a refrigerated product (cold storage declaration, C-25)
                          'price_change',       -- MRP or rate differs from the batch's accepted value (C-16)
                          'expiry_change',      -- later expiry than the batch's recorded one (C-27)
                          'short_for_orders')), -- the software has fewer packs than Dawabag orders hold
  item_key              VARCHAR(400) NOT NULL,
  batch_key             VARCHAR(120) NOT NULL DEFAULT '',
  product_id            UUID REFERENCES products(id),
  partner_inventory_id  UUID REFERENCES partner_inventory(id) ON DELETE CASCADE,
  item_name             VARCHAR(500),
  batch_number          VARCHAR(100),
  details               JSONB NOT NULL DEFAULT '{}',   -- latest values from the feed and the current ones
  status                VARCHAR(12) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'dismissed', 'resolved')),
  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_import_id        UUID REFERENCES partner_stock_imports(id) ON DELETE SET NULL,
  resolved_by           UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at           TIMESTAMPTZ,
  resolution_note       VARCHAR(500)
);
-- One open item per thing (repeated snapshots update it, never add another)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pfc_open ON partner_feed_checks(partner_id, kind, item_key, batch_key) WHERE status = 'open';
-- "Not sold on Dawabag": a new item the partner set aside is not raised again
CREATE UNIQUE INDEX IF NOT EXISTS idx_pfc_dismissed ON partner_feed_checks(partner_id, kind, item_key) WHERE status = 'dismissed';
CREATE INDEX IF NOT EXISTS idx_pfc_partner_status ON partner_feed_checks(partner_id, status, first_seen_at);

-- ── 5. What a partner batch may sell, with the live feed's staleness ─────────
-- One rule for search, product page, cart and allocation (services/stock/partnerStock.ts,
-- allocation.service.ts). Manual partners: available − reserved, as before. Live
-- partners: the same while the last snapshot is fresh; never received → nothing;
-- stale → nothing ('hide') or only what is above the safety margin ('margin').
CREATE OR REPLACE FUNCTION dawabag_partner_sellable(p_partner UUID, p_available INTEGER, p_reserved INTEGER)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN f.partner_id IS NULL OR f.mode <> 'live' THEN GREATEST(p_available - p_reserved, 0)
    WHEN f.last_taken_at IS NULL THEN 0
    WHEN f.last_taken_at >= NOW() - make_interval(mins => f.stale_after_minutes) THEN GREATEST(p_available - p_reserved, 0)
    WHEN f.stale_policy = 'margin' THEN GREATEST(FLOOR((p_available - p_reserved) * (100 - f.stale_margin_pct) / 100.0)::int, 0)
    ELSE 0 END
  FROM (SELECT 1) AS one LEFT JOIN partner_stock_feeds f ON f.partner_id = p_partner
$$;
