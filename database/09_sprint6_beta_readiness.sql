-- ─────────────────────────────────────────────────────────────────────────────
-- 09_sprint6_beta_readiness.sql — Sprint 6 (beta launch readiness)
-- Applied by the migration runner (backend/src/db/migrate.ts). Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Coupons: one row per use, and an optional per-buyer limit ────────────────
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS per_user_limit INTEGER CHECK (per_user_limit IS NULL OR per_user_limit > 0);
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  coupon_id   UUID NOT NULL REFERENCES coupons(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (coupon_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions(coupon_id, user_id);
