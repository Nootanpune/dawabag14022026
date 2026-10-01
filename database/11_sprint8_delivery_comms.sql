-- ─────────────────────────────────────────────────────────────────────────────
-- 11_sprint8_delivery_comms.sql — Sprint 8 (delivery and customer communications)
-- Applied by the migration runner. Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Devices for push notifications (several per user) ───────────────────────
CREATE TABLE IF NOT EXISTS user_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token     TEXT NOT NULL UNIQUE,
  platform      VARCHAR(10) CHECK (platform IN ('android', 'ios', 'web')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id);
INSERT INTO user_devices (user_id, fcm_token)
  SELECT id, fcm_token FROM users WHERE fcm_token IS NOT NULL AND fcm_token <> ''
ON CONFLICT (fcm_token) DO NOTHING;

-- ── Delivery log: one row per channel attempt ────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id  UUID REFERENCES notifications(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
  type             VARCHAR(50) NOT NULL,
  channel          VARCHAR(10) NOT NULL CHECK (channel IN ('sms', 'email', 'push')),
  status           VARCHAR(10) NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  provider_ref     VARCHAR(200),
  detail           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON notification_deliveries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deliveries_user ON notification_deliveries(user_id, created_at DESC);

-- ── Courier booking and tracking ─────────────────────────────────────────────
ALTER TABLE order_shipments
  ADD COLUMN IF NOT EXISTS courier_provider     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS courier_order_ref    VARCHAR(60),
  ADD COLUMN IF NOT EXISTS courier_shipment_ref VARCHAR(60),
  ADD COLUMN IF NOT EXISTS tracking_status      VARCHAR(40),
  ADD COLUMN IF NOT EXISTS rto_at               TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS shipment_tracking_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id  UUID NOT NULL REFERENCES order_shipments(id) ON DELETE CASCADE,
  status       VARCHAR(30) NOT NULL,          -- normalised: booked, picked_up, in_transit, out_for_delivery, delivered, rto, exception
  raw_status   VARCHAR(100) NOT NULL,
  location     VARCHAR(200),
  event_time   TIMESTAMPTZ NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shipment_id, raw_status, event_time)
);
CREATE INDEX IF NOT EXISTS idx_tracking_shipment ON shipment_tracking_events(shipment_id, event_time);

INSERT INTO app_settings (key, value, description) VALUES
  ('courier.provider', '"manual"', 'manual: staff type the courier and AWB; shiprocket: book through Shiprocket'),
  ('courier.pickup_location', '"Primary"', 'Shiprocket pickup location name for Dawabag''s store'),
  ('sms.dlt_templates', '{}',
   'Per message type: {"template_id": "<MSG91 flow id>", "vars": ["order_number", ...]} for the DLT-registered text (TRAI)')
ON CONFLICT (key) DO NOTHING;
