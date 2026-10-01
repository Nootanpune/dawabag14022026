-- ─────────────────────────────────────────────────────────────────────────────
-- 14_sprint11_payments.sql — Sprint 11 (payments end to end)
-- Applied by the migration runner. Safe to re-run.
--
-- 1. Razorpay webhook events: each event acted on once (Razorpay retries), with
--    the outcome kept for audit. Only ids and amounts are kept, never card or
--    contact details (C-41).
-- 2. Refund legs remember how often they were sent to the gateway.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  event_id      VARCHAR(100) PRIMARY KEY,       -- x-razorpay-event-id
  event         VARCHAR(60) NOT NULL,
  entity_id     VARCHAR(100),                   -- pay_ / rfnd_ / token_ id
  order_ref     VARCHAR(100),                   -- the gateway order id, when there is one
  amount_paise  INTEGER,
  outcome       TEXT,                           -- what Dawabag did with it
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received ON payment_webhook_events(received_at);

ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS gateway_attempts INTEGER NOT NULL DEFAULT 0;
