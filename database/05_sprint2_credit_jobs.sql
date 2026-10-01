-- ─────────────────────────────────────────────────────────────────────────────
-- 05_sprint2_credit_jobs.sql — Sprint 2
-- Run after 04_registration_kyc_consent.sql. Safe to re-run.
--
-- 1. Credit accounts on users. order.controller already read/wrote
--    users.credit_limit_paise / credit_used_paise, but no migration created them
--    (they existed only on pharmacy_profiles), so every credit order failed.
-- 2. Credit settlement + reminder tracking on orders
-- 3. job_runs: one row per scheduled-job run, for the admin panel
-- 4. carts / cart_items: the server-side cart
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Credit accounts ───────────────────────────────────────────────────────
-- A limit of 0 means no credit: only prepaid/CAD. Set by admin per account.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS credit_limit_paise INTEGER NOT NULL DEFAULT 0
    CHECK (credit_limit_paise >= 0),
  ADD COLUMN IF NOT EXISTS credit_used_paise  INTEGER NOT NULL DEFAULT 0
    CHECK (credit_used_paise >= 0);

-- ── 2. Credit settlement + reminders ─────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS credit_settled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credit_settled_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_orders_credit_open
  ON orders(credit_due_date)
  WHERE credit_due_date IS NOT NULL AND credit_settled_at IS NULL;

-- One reminder per order per "days before due" (3, 1, 0 = due today, -N overdue)
CREATE TABLE IF NOT EXISTS credit_reminders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  days_before  INTEGER NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, days_before)
);

-- ── 3. Scheduled job runs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name     VARCHAR(60) NOT NULL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  status       VARCHAR(20) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed')),
  summary      JSONB,
  error        TEXT,
  triggered_by UUID REFERENCES users(id)   -- NULL = scheduler
);

CREATE INDEX IF NOT EXISTS idx_job_runs_name ON job_runs(job_name, started_at DESC);

-- ── 4. Server-side cart (single source of truth — no client-side cart) ───────
-- Only product + quantity are stored; prices, stock and limits are computed
-- live from products/inventory on every read, so nothing is duplicated.
CREATE TABLE IF NOT EXISTS carts (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  coupon_code  VARCHAR(50),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id   UUID NOT NULL REFERENCES products(id),
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);
