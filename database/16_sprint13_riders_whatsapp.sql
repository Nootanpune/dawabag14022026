-- ─────────────────────────────────────────────────────────────────────────────
-- 16_sprint13_riders_whatsapp.sql — Sprint 13 (own riders, WhatsApp, GST lock)
-- Applied by the migration runner. Safe to re-run.
--
-- 1. Dawabag's own riders: a dispatched parcel is assigned to one rider, who sees
--    only the parcels assigned to them (C-26, C-41: least access)
-- 2. WhatsApp messages: only to buyers who opted in; logged like SMS
-- 3. Settings: WhatsApp templates; GST period lock
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE order_shipments
  ADD COLUMN IF NOT EXISTS rider_id     UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS assigned_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_by  UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_shipments_rider ON order_shipments(rider_id, status) WHERE rider_id IS NOT NULL;
CREATE SEQUENCE IF NOT EXISTS rider_run_seq;

ALTER TABLE consent_records DROP CONSTRAINT IF EXISTS consent_records_purpose_check;
ALTER TABLE consent_records ADD CONSTRAINT consent_records_purpose_check
  CHECK (purpose IN ('privacy_notice', 'age_18_plus', 'marketing', 'practitioner_declaration', 'whatsapp'));

ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_channel_check;
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_channel_check
  CHECK (channel IN ('sms', 'email', 'push', 'whatsapp'));

INSERT INTO app_settings (key, value, description) VALUES
  ('whatsapp.templates', '{}',
   'WhatsApp message templates approved by Meta, per message type: {"<type>": {"name": "...", "language": "en", "vars": ["order_number", ...]}}. Sent only to buyers who opted in'),
  ('accounts.locked_until', 'null',
   'GST period lock: purchase and supplier documents cannot be dated on or before this date (returns filed). null = open')
ON CONFLICT (key) DO NOTHING;
