-- ─────────────────────────────────────────────────────────────────────────────
-- 20_sprint20_free_delivery.sql — Sprint 20 (free delivery for retail orders)
-- Applied by the migration runner. Safe to re-run.
--
-- Owner decision (1 Oct 2026): retail orders whose medicines come to ₹499 or more
-- (after any coupon, before GST) are delivered free. Admins change the amount in
-- Settings; null switches it off. Trade buyers keep their own rule (free above
-- ₹5,000). The published shipping policy must say the same (C-39).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO app_settings (key, value, description) VALUES
  ('delivery.free_above_paise', '49900',
   'Retail orders whose items (after coupon, before GST) come to at least this many paise are delivered free; null = off')
ON CONFLICT (key) DO NOTHING;
