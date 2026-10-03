-- ─────────────────────────────────────────────────────────────────────────────
-- 39_sprint44_invoice_at_approval_practitioner_sales.sql — Sprint 44
-- Applied by the migration runner (backend/src/db/migrate.ts) as the database owner.
-- Safe to re-run (IF NOT EXISTS, constraints / functions / triggers re-created).
--
--  1. The tax invoice is issued when the pharmacist approves (owner decision CONFIRMED
--     2026-10-03: "Once the invoice is issued, orders cannot be changed. The order can only
--     be changed/edited before the pharmacist's approval; any new prescription drug added
--     requires a valid prescription."). Until Sprint 43 a shipment took its seller's
--     gap-free invoice number at ORDER PLACEMENT. From Sprint 44 the number (and the
--     invoice date, invoice_issued_at) is taken in the same database transaction that
--     records the pharmacist's release of that shipment (Sprint 35 check, C-08): a trigger
--     on order_shipments issues it the moment pharmacist_check becomes 'released', so no
--     code path can release without an invoice or issue one without a release. The sale
--     record (seller licences, channel, line licences, buyer licences — Sprint 42) is
--     frozen by the API in that same transaction (saleIdentity/record.service.ts). Before
--     the invoice the order's lines and the shipment amounts may still change (the buyer's
--     edits, services/orderEdit); after it they are final as before (C-30, C-46). Existing
--     shipments keep the numbers they already have (invoice_issued_at = created_at, no
--     renumbering). Numbering stays gap-free: the counter row is taken inside the release
--     transaction, which either commits with the invoice or rolls back with it.
--  2. Order changes before the invoice (Sprint 44 replaces the Sprint 43 credit-note path
--     for pre-invoice edits): order_edits records the stage, the order value before/after,
--     an extra amount to collect (second payment, payments.order_edit_id) and the
--     prescription / written order that covers added lines.
--  3. Sales to doctors and medical institutions — Maharashtra FDA (Pune Division) circular
--     No. Drug/Wholesalers Memo./16/2026/1 dated 30-09-2026; Drugs Rules 1945 r.64(2)
--     (sale under a registered pharmacist's supervision) and r.65(9)(b) (no supply to a
--     Registered Medical Practitioner without a signed written order; records of every
--     such sale with a copy of the doctor's registration certificate):
--       * the doc_hospital buyer's council registration is verified by Dawabag staff with
--         a valid-till date and the certificate copy that was checked (users.nmc_*);
--         an institution names its responsible RMP (the same nmc_* fields) and its own
--         registration / licence is a checked party_licences row (Sprint 30, no new table);
--       * written_orders: the signed written order (uploaded signed requisition, or an
--         in-app requisition signed by the doctor's own login), final once made and
--         linked to the order (and to an order change);
--       * order_shipments.buyer_registration: the buyer's registration as on the day of
--         sale, frozen with the rest of the sale record.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Invoice issued at the pharmacist's release ────────────────────────────
ALTER TABLE order_shipments ALTER COLUMN invoice_number DROP NOT NULL;
ALTER TABLE order_shipments ADD COLUMN IF NOT EXISTS invoice_issued_at TIMESTAMPTZ;
ALTER TABLE order_shipments ADD COLUMN IF NOT EXISTS buyer_registration JSONB;
COMMENT ON COLUMN order_shipments.invoice_issued_at IS
  'Sprint 44: when the tax invoice was issued (= invoice date). Since Sprint 44 at the pharmacist''s release; before that at order placement (backfilled from created_at)';
COMMENT ON COLUMN order_shipments.buyer_registration IS
  'Sprint 44: a doctor / institution buyer''s council registration as on the day of sale (number, council, valid till, certificate copy) — r.65(9)(b), FDA Pune circular 16/2026';

-- Existing shipments: the number they took at placement stands, dated as before (no renumbering)
UPDATE order_shipments SET invoice_issued_at = created_at WHERE invoice_number IS NOT NULL AND invoice_issued_at IS NULL;

ALTER TABLE order_shipments DROP CONSTRAINT IF EXISTS order_shipments_invoice_issue_check;
ALTER TABLE order_shipments ADD CONSTRAINT order_shipments_invoice_issue_check CHECK (
  (invoice_number IS NULL) = (invoice_issued_at IS NULL)
  -- a released shipment always has its invoice (issued by the trigger below)
  AND (pharmacist_check <> 'released' OR invoice_number IS NOT NULL)
);

-- The issue itself: the seller's own gap-free series (Dawabag 'DWB', a partner its prefix),
-- in the release's transaction. Dawabag's number is also kept on the order (as before).
CREATE OR REPLACE FUNCTION dawabag_issue_shipment_invoice() RETURNS trigger AS $$
DECLARE
  v_prefix VARCHAR;
BEGIN
  IF NEW.pharmacist_check = 'released' AND NEW.invoice_number IS NULL AND NEW.status <> 'cancelled' THEN
    IF NEW.seller_type = 'dawabag' THEN
      NEW.invoice_number := next_invoice_number('DWB', 'DWB');
      UPDATE orders SET invoice_number = NEW.invoice_number WHERE id = NEW.order_id AND invoice_number IS NULL;
    ELSE
      SELECT invoice_prefix INTO v_prefix FROM vendors WHERE id = NEW.partner_id;
      IF v_prefix IS NULL OR btrim(v_prefix) = '' THEN
        RAISE EXCEPTION 'The partner''s invoice series is not set up; the shipment cannot be invoiced' USING ERRCODE = 'P0001';
      END IF;
      NEW.invoice_number := next_invoice_number('P:' || NEW.partner_id::text, v_prefix);
    END IF;
    NEW.invoice_issued_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS order_shipments_issue_invoice ON order_shipments;
-- Named to fire after order_shipments_amounts_final / _identity_final (BEFORE triggers run by name)
CREATE TRIGGER order_shipments_issue_invoice BEFORE UPDATE OF pharmacist_check ON order_shipments
  FOR EACH ROW EXECUTE FUNCTION dawabag_issue_shipment_invoice();

-- Amounts: free before the invoice (the buyer's changes), final once it is issued (C-30)
CREATE OR REPLACE FUNCTION dawabag_shipment_amounts_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.invoice_number IS NULL THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Invoice % cannot be deleted: invoices are final', OLD.invoice_number USING ERRCODE = 'P0001';
  END IF;
  IF OLD.invoice_number IS NULL THEN
    -- not invoiced yet: the shipment may still change; its seller never does
    IF (NEW.seller_type, NEW.partner_id) IS DISTINCT FROM (OLD.seller_type, OLD.partner_id) THEN
      RAISE EXCEPTION 'The seller of a shipment cannot be changed' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.invoice_number, NEW.invoice_issued_at, NEW.subtotal_paise, NEW.gst_paise, NEW.total_paise, NEW.seller_type, NEW.partner_id)
     IS DISTINCT FROM (OLD.invoice_number, OLD.invoice_issued_at, OLD.subtotal_paise, OLD.gst_paise, OLD.total_paise, OLD.seller_type, OLD.partner_id) THEN
    RAISE EXCEPTION 'Invoice % amounts are final; issue a credit note instead', OLD.invoice_number USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Lines: free while their shipment has no invoice, final once it has (C-30)
CREATE OR REPLACE FUNCTION dawabag_line_amounts_final() RETURNS trigger AS $$
DECLARE
  v_invoiced boolean;
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT invoice_number IS NOT NULL INTO v_invoiced FROM order_shipments WHERE id = OLD.shipment_id;
  IF NOT COALESCE(v_invoiced, FALSE) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF NEW.shipment_id IS DISTINCT FROM OLD.shipment_id THEN
      RAISE EXCEPTION 'A line cannot move to another seller''s shipment' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Invoiced lines cannot be deleted' USING ERRCODE = 'P0001';
  END IF;
  IF (NEW.product_id, NEW.quantity, NEW.unit_price_paise, NEW.mrp_paise, NEW.gst_rate, NEW.cgst_paise, NEW.sgst_paise,
      NEW.igst_paise, NEW.line_total_paise, NEW.shipment_id, NEW.batch_id)
     IS DISTINCT FROM (OLD.product_id, OLD.quantity, OLD.unit_price_paise, OLD.mrp_paise, OLD.gst_rate, OLD.cgst_paise, OLD.sgst_paise,
      OLD.igst_paise, OLD.line_total_paise, OLD.shipment_id, OLD.batch_id) THEN
    RAISE EXCEPTION 'Invoiced lines are final; issue a credit note instead' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A credit note reverses an invoice: none against a shipment that was never invoiced
CREATE OR REPLACE FUNCTION dawabag_credit_note_needs_invoice() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM order_shipments WHERE id = NEW.shipment_id AND invoice_number IS NOT NULL) THEN
    RAISE EXCEPTION 'No tax invoice has been issued for this shipment, so there is nothing to credit' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS credit_notes_need_invoice ON credit_notes;
CREATE TRIGGER credit_notes_need_invoice BEFORE INSERT ON credit_notes
  FOR EACH ROW EXECUTE FUNCTION dawabag_credit_note_needs_invoice();

-- The frozen sale record now also holds the practitioner buyer's registration (Sprint 42 + 44)
CREATE OR REPLACE FUNCTION dawabag_shipment_identity_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN NEW; END IF;
  IF OLD.sale_identity_frozen_at IS NOT NULL
     AND (NEW.sale_channel, NEW.sale_buyer_type, NEW.seller_drug_licences, NEW.sale_licences, NEW.buyer_drug_licences,
          NEW.sale_identity_frozen_at, NEW.sale_identity_source, NEW.buyer_registration)
         IS DISTINCT FROM
         (OLD.sale_channel, OLD.sale_buyer_type, OLD.seller_drug_licences, OLD.sale_licences, OLD.buyer_drug_licences,
          OLD.sale_identity_frozen_at, OLD.sale_identity_source, OLD.buyer_registration) THEN
    RAISE EXCEPTION 'Invoice %: the sale record (seller licences, sale channel, buyer licences and registration) was fixed at the sale and cannot be changed', OLD.invoice_number
      USING ERRCODE = 'P0001';
  END IF;
  IF OLD.pharmacist_check IN ('released', 'rejected', 'not_recorded')
     AND (NEW.pharmacist_check, NEW.pharmacist_checked_by, NEW.pharmacist_checked_at, NEW.pharmacist_name, NEW.pharmacist_reg_no,
          NEW.vendor_pharmacist_id, NEW.pharmacist_check_note, NEW.pharmacist_registration)
         IS DISTINCT FROM
         (OLD.pharmacist_check, OLD.pharmacist_checked_by, OLD.pharmacist_checked_at, OLD.pharmacist_name, OLD.pharmacist_reg_no,
          OLD.vendor_pharmacist_id, OLD.pharmacist_check_note, OLD.pharmacist_registration) THEN
    RAISE EXCEPTION 'Invoice %: the pharmacist''s check is recorded and cannot be changed', OLD.invoice_number USING ERRCODE = 'P0001';
  END IF;
  IF OLD.pharmacist_registration IS NOT NULL AND NEW.pharmacist_registration IS DISTINCT FROM OLD.pharmacist_registration THEN
    RAISE EXCEPTION 'Invoice %: the pharmacist''s registration was recorded at the check and cannot be changed', OLD.invoice_number USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The order keeps the buyer's price type and the amounts as placed (order changes before the
-- invoice re-price the order from these: the coupon discount shrinks in proportion, never grows)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pricing_type          VARCHAR(20),
  ADD COLUMN IF NOT EXISTS placed_subtotal_paise INTEGER,
  ADD COLUMN IF NOT EXISTS placed_gst_paise      INTEGER,
  ADD COLUMN IF NOT EXISTS placed_discount_paise INTEGER;
UPDATE orders SET placed_subtotal_paise = subtotal_paise, placed_gst_paise = gst_paise, placed_discount_paise = discount_paise
 WHERE placed_subtotal_paise IS NULL;
COMMENT ON COLUMN orders.pricing_type IS
  'Sprint 44: the buyer''s price type when the order was placed (customer | b2b_retailer | b2b_wholesaler | doc_hospital); the sale record at invoice issue uses it';

-- ── 2. Order changes before the invoice ──────────────────────────────────────
ALTER TABLE order_edits
  ADD COLUMN IF NOT EXISTS stage              VARCHAR(15) NOT NULL DEFAULT 'after_invoice',
  ADD COLUMN IF NOT EXISTS value_before_paise INTEGER,
  ADD COLUMN IF NOT EXISTS value_after_paise  INTEGER,
  ADD COLUMN IF NOT EXISTS extra_paise        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_status       VARCHAR(20) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS prescription_id    UUID REFERENCES prescriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS written_order_id   UUID,
  ADD COLUMN IF NOT EXISTS sent_to_pharmacist BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE order_edits DROP CONSTRAINT IF EXISTS order_edits_sprint44_check;
ALTER TABLE order_edits ADD CONSTRAINT order_edits_sprint44_check CHECK (
  stage IN ('after_invoice', 'before_invoice')
  AND extra_paise >= 0
  -- none: nothing more to pay; awaiting_payment: the buyer pays the difference (second payment);
  -- authorised: that payment is held for the pharmacist's check; paid: captured; on_credit_bill:
  -- added to a trade buyer's credit bill; superseded: a later change replaced it before it was
  -- paid; cancelled: the order was cancelled before it was paid
  AND extra_status IN ('none', 'awaiting_payment', 'authorised', 'paid', 'on_credit_bill', 'superseded', 'cancelled')
  AND (extra_status = 'none') = (extra_paise = 0)
);
ALTER TABLE order_edits DROP CONSTRAINT IF EXISTS order_edits_refund_status_check;
DO $$ DECLARE c text; BEGIN
  -- the inline CHECK of migration 38 on refund_status (name chosen by PostgreSQL)
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'order_edits'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) LIKE '%refund_status%' AND conname <> 'order_edits_sprint44_check' LOOP
    EXECUTE format('ALTER TABLE order_edits DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
-- credit_bill: a trade buyer's credit bill was lowered (nothing paid back)
ALTER TABLE order_edits ADD CONSTRAINT order_edits_refund_status_check
  CHECK (refund_status IN ('none', 'recorded', 'after_capture', 'not_needed', 'credit_bill'));
CREATE INDEX IF NOT EXISTS idx_order_edits_awaiting ON order_edits (order_id) WHERE extra_status = 'awaiting_payment';

-- Append-only, except the refund and extra-payment status moving on (C-46)
CREATE OR REPLACE FUNCTION dawabag_order_edits_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Order changes are kept: they cannot be deleted' USING ERRCODE = 'P0001'; END IF;
  IF (NEW.order_id, NEW.edited_by, NEW.edited_at, NEW.lines, NEW.credit_notes, NEW.refund_paise, NEW.stage,
      NEW.value_before_paise, NEW.value_after_paise, NEW.extra_paise, NEW.prescription_id, NEW.written_order_id, NEW.sent_to_pharmacist)
     IS DISTINCT FROM (OLD.order_id, OLD.edited_by, OLD.edited_at, OLD.lines, OLD.credit_notes, OLD.refund_paise, OLD.stage,
      OLD.value_before_paise, OLD.value_after_paise, OLD.extra_paise, OLD.prescription_id, OLD.written_order_id, OLD.sent_to_pharmacist) THEN
    RAISE EXCEPTION 'An order change is final; only its refund and payment status may be updated' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The second payment for an order change
ALTER TABLE payments ADD COLUMN IF NOT EXISTS order_edit_id UUID REFERENCES order_edits(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_order_edit ON payments (order_edit_id) WHERE order_edit_id IS NOT NULL;

-- ── 3. Sales to doctors and medical institutions (r.64(2), r.65(9)(b); circular 16/2026) ──
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS practitioner_kind    VARCHAR(12),
  ADD COLUMN IF NOT EXISTS nmc_status           VARCHAR(12),
  ADD COLUMN IF NOT EXISTS nmc_valid_till       DATE,
  ADD COLUMN IF NOT EXISTS nmc_verified_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nmc_verified_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nmc_certificate_key  VARCHAR(500),
  ADD COLUMN IF NOT EXISTS nmc_status_note      TEXT;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_practitioner_registration_check;
ALTER TABLE users ADD CONSTRAINT users_practitioner_registration_check CHECK (
  (practitioner_kind IS NULL OR practitioner_kind IN ('doctor', 'institution'))
  AND (nmc_status IS NULL OR nmc_status IN ('pending', 'verified', 'rejected', 'suspended'))
  -- verified = a staff member checked the register with the certificate copy and recorded until when it is valid
  AND (nmc_status IS DISTINCT FROM 'verified' OR nmc_valid_till IS NULL OR (nmc_verified_at IS NOT NULL AND nmc_certificate_key IS NOT NULL))
);
COMMENT ON COLUMN users.nmc_status IS
  'Sprint 44: the doctor''s (or the institution''s responsible RMP''s) council registration — verified by Dawabag staff against the register and the uploaded certificate, with valid till (r.65(9)(b); FDA Pune circular 16/2026)';
COMMENT ON COLUMN users.nmc_certificate_key IS
  'Sprint 44: object-store key of the registration certificate copy that was checked (kept for the records of sales to doctors)';
-- Existing doctor / hospital accounts: a verified number stays verified, but no sale until the
-- valid-till date and the checked certificate copy are recorded (the circular asks for both)
UPDATE users SET practitioner_kind = 'doctor' WHERE customer_type = 'doc_hospital' AND practitioner_kind IS NULL;
UPDATE users SET nmc_status = CASE WHEN nmc_reg_verified THEN 'verified' ELSE 'pending' END,
                 nmc_status_note = CASE WHEN nmc_reg_verified THEN 'Verified before Sprint 44: record the valid-till date and the certificate copy checked' END
 WHERE customer_type = 'doc_hospital' AND nmc_status IS NULL;

CREATE TABLE IF NOT EXISTS written_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CASCADE only reaches here when a user / order row itself is deleted, which the API never does;
  -- the trigger below still refuses the delete for everyone but the maintenance role (C-46)
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind              VARCHAR(10) NOT NULL CHECK (kind IN ('upload', 'in_app')),
  -- (a) an uploaded signed requisition (PDF / image) in the private object store
  document_key      VARCHAR(500),
  document_name     VARCHAR(255),
  document_mime     VARCHAR(100),
  document_size     INTEGER,
  document_sha256   CHAR(64),
  -- (b) an in-app requisition the doctor signed with their own login
  items             JSONB,             -- [{product_id, product_name, quantity}]
  declaration_text  TEXT,
  typed_name        VARCHAR(200),
  signature_method  VARCHAR(30),       -- 'password_reauth' (developer's choice; to confirm with lawyer / FDA)
  content_sha256    CHAR(64),          -- hash of the signed text (items, declaration, signer, time)
  -- the buyer's registration as at signing / upload
  practitioner      JSONB NOT NULL,
  signed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address        VARCHAR(45),
  user_agent        VARCHAR(300),
  -- linked once, to the order it authorises (and the change, for an order change)
  order_id          UUID REFERENCES orders(id) ON DELETE CASCADE,
  -- deferred: an order change links its written order in the same transaction that records the change
  order_edit_id     UUID REFERENCES order_edits(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
  attached_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT written_orders_content_check CHECK (
    (kind = 'upload' AND document_key IS NOT NULL AND document_sha256 IS NOT NULL)
    OR (kind = 'in_app' AND items IS NOT NULL AND declaration_text IS NOT NULL AND typed_name IS NOT NULL
        AND signature_method IS NOT NULL AND content_sha256 IS NOT NULL)),
  CONSTRAINT written_orders_attached_check CHECK ((order_id IS NULL) = (attached_at IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_written_orders_user ON written_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_written_orders_order ON written_orders (order_id) WHERE order_id IS NOT NULL;
COMMENT ON TABLE written_orders IS
  'Sprint 44: signed written orders of doctors / institutions (Drugs Rules r.65(9)(b); FDA Pune circular Drug/Wholesalers Memo./16/2026/1, 30-09-2026). Final once made; linked once to its order';

-- Final once made: only the link to an order (and order change) may be written, once (C-46)
CREATE OR REPLACE FUNCTION dawabag_written_order_final() RETURNS trigger AS $$
BEGIN
  IF dawabag_maintenance_active() THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A written order is kept with the sale record: it cannot be deleted' USING ERRCODE = 'P0001'; END IF;
  IF (NEW.id, NEW.user_id, NEW.kind, NEW.document_key, NEW.document_name, NEW.document_mime, NEW.document_size, NEW.document_sha256,
      NEW.items, NEW.declaration_text, NEW.typed_name, NEW.signature_method, NEW.content_sha256, NEW.practitioner, NEW.signed_at,
      NEW.ip_address, NEW.user_agent, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.user_id, OLD.kind, OLD.document_key, OLD.document_name, OLD.document_mime, OLD.document_size, OLD.document_sha256,
      OLD.items, OLD.declaration_text, OLD.typed_name, OLD.signature_method, OLD.content_sha256, OLD.practitioner, OLD.signed_at,
      OLD.ip_address, OLD.user_agent, OLD.created_at) THEN
    RAISE EXCEPTION 'A written order cannot be changed once it is made; make a new one' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.order_id IS NOT NULL AND (NEW.order_id, NEW.order_edit_id, NEW.attached_at) IS DISTINCT FROM (OLD.order_id, OLD.order_edit_id, OLD.attached_at) THEN
    RAISE EXCEPTION 'This written order is already attached to an order' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS written_orders_final ON written_orders;
CREATE TRIGGER written_orders_final BEFORE UPDATE OR DELETE ON written_orders
  FOR EACH ROW EXECUTE FUNCTION dawabag_written_order_final();

ALTER TABLE order_edits DROP CONSTRAINT IF EXISTS order_edits_written_order_fkey;
ALTER TABLE order_edits ADD CONSTRAINT order_edits_written_order_fkey FOREIGN KEY (written_order_id) REFERENCES written_orders(id) ON DELETE SET NULL;

-- ── 4. Privileges (Sprint 41: the API is a login in dawabag_app only) ────────
GRANT SELECT, INSERT, UPDATE, DELETE ON written_orders TO dawabag_app, dawabag_maintenance;
