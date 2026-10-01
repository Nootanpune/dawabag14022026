-- ─────────────────────────────────────────────────────────────────────────────
-- 18_sprint16_indexes.sql — Sprint 16 (indexes for the busy paths)
-- Applied by the migration runner. Safe to re-run.
--
-- Child rows looked up by their parent on every order, dispatch, return, recall
-- and report had no index, so each lookup read the whole table. Found by listing
-- foreign keys without an index and checking which ones the code queries.
-- (On a large live table, run the same statements with CREATE INDEX CONCURRENTLY
-- outside a transaction instead; at go-live the tables are small.)
-- ─────────────────────────────────────────────────────────────────────────────

-- Orders and fulfilment: lines of a shipment (pack, dispatch, Rx and recall gates),
-- lines of a product or batch (recall: who received it, C-28)
CREATE INDEX IF NOT EXISTS idx_order_items_shipment ON order_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_batch ON order_items(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_poi_shipment ON partner_order_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_poi_order_item ON partner_order_items(order_item_id);
CREATE INDEX IF NOT EXISTS idx_poi_inventory ON partner_order_items(partner_inv_id) WHERE partner_inv_id IS NOT NULL;

-- Recall-alert matching compares batch numbers on letters and digits only (C-28)
CREATE INDEX IF NOT EXISTS idx_batches_batch_key
  ON inventory_batches ((upper(regexp_replace(batch_number, '[^A-Za-z0-9]', '', 'g'))));
CREATE INDEX IF NOT EXISTS idx_pinv_batch_key
  ON partner_inventory ((upper(regexp_replace(batch_number, '[^A-Za-z0-9]', '', 'g'))));
CREATE INDEX IF NOT EXISTS idx_recall_alert_matches_product ON recall_alert_matches(product_id);

-- Purchasing and stock
CREATE INDEX IF NOT EXISTS idx_po_items_po ON po_items(po_id);
CREATE INDEX IF NOT EXISTS idx_grn_lines_grn ON grn_lines(grn_id);
CREATE INDEX IF NOT EXISTS idx_grn_lines_batch ON grn_lines(batch_id);

-- Returns, refunds, credit notes and settlements (C-37)
CREATE INDEX IF NOT EXISTS idx_return_requests_order ON return_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_return ON refunds(return_id) WHERE return_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_notes_order ON credit_notes(order_id);
CREATE INDEX IF NOT EXISTS idx_settlement_adj_open ON settlement_adjustments(partner_id) WHERE settlement_batch_id IS NULL;

-- Teleconsultation: a patient's consultations and e-prescriptions; refund webhooks
-- and the refund sweep (C-22..C-24, C-37)
CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations(patient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consultations_refund ON consultations(gateway_refund_id) WHERE gateway_refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consultations_refund_pending ON consultations(id) WHERE payment_status = 'refund_pending';
CREATE INDEX IF NOT EXISTS idx_eprescriptions_patient ON digital_prescriptions(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_eprescription_items_rx ON digital_prescription_items(prescription_id);

-- Account pages and privacy requests
CREATE INDEX IF NOT EXISTS idx_refills_user ON refill_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_data_requests_user ON data_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_grievance_messages_ticket ON grievance_messages(grievance_id);
CREATE INDEX IF NOT EXISTS idx_adr_user ON adverse_event_reports(user_id);

-- Retention purge (C-44): old rows by age, and the inbox copy's delivery rows
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_created ON notification_deliveries(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification ON notification_deliveries(notification_id) WHERE notification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_sent ON notifications(sent_at);
