-- ============================================================
-- Sprint 35 — a registered pharmacist checks and releases EVERY order before it
-- is packed (owner decision 2026-10-02, Rulebook C-08), not only prescription
-- orders. Recorded per shipment, because each shipment has its own seller of
-- record and its own pharmacist:
--   * Dawabag's own shipments: a Dawabag pharmacist (role pharmacist_rx with a
--     registration number). For an order with prescription medicines the
--     prescription review IS the check (one step, not two).
--   * Partner shipments: the partner's own registered pharmacist (vendor_pharmacists,
--     Sprint 28) — the competent person on the partner's drug licence.
-- Packing and dispatch are refused on the server until the shipment is released.
-- Re-runnable (IF NOT EXISTS, backfill only where still NULL, guarded page update).
-- ============================================================

-- ── 1. Pharmacist check on each shipment ─────────────────────────────────────
-- pending       waiting for the pharmacist
-- held          the pharmacist put it on hold (reason in pharmacist_check_note)
-- released      checked and released for packing (name + reg. no. recorded)
-- rejected      the pharmacist declined to supply; the order was cancelled and refunded (C-37)
-- not_recorded  packed, dispatched or closed before Sprint 35 (no check was recorded then)
ALTER TABLE order_shipments
  ADD COLUMN IF NOT EXISTS pharmacist_check       VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pharmacist_checked_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pharmacist_checked_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pharmacist_name        VARCHAR(200),
  ADD COLUMN IF NOT EXISTS pharmacist_reg_no      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS vendor_pharmacist_id   UUID REFERENCES vendor_pharmacists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pharmacist_check_note  TEXT;

-- Existing rows: a shipment still waiting to be packed now needs the check; anything
-- already packed, on its way, delivered or cancelled is left as it was
UPDATE order_shipments SET pharmacist_check = CASE WHEN status = 'pending' THEN 'pending' ELSE 'not_recorded' END
 WHERE pharmacist_check IS NULL;
ALTER TABLE order_shipments ALTER COLUMN pharmacist_check SET DEFAULT 'pending';
ALTER TABLE order_shipments ALTER COLUMN pharmacist_check SET NOT NULL;

ALTER TABLE order_shipments DROP CONSTRAINT IF EXISTS order_shipments_pharmacist_check_check;
ALTER TABLE order_shipments ADD CONSTRAINT order_shipments_pharmacist_check_check CHECK (
  pharmacist_check IN ('pending', 'held', 'released', 'rejected', 'not_recorded')
  -- a release always names the pharmacist and their registration number (C-08, C-46)
  AND (pharmacist_check <> 'released' OR (pharmacist_name IS NOT NULL AND pharmacist_reg_no IS NOT NULL AND pharmacist_checked_at IS NOT NULL))
  -- a hold or a refusal always says why
  AND (pharmacist_check NOT IN ('held', 'rejected') OR length(btrim(coalesce(pharmacist_check_note, ''))) >= 5)
);

COMMENT ON COLUMN order_shipments.pharmacist_check IS
  'Sprint 35: pharmacist check of this shipment before packing — pending | held | released | rejected | not_recorded (C-08)';
COMMENT ON COLUMN order_shipments.vendor_pharmacist_id IS
  'Partner shipments: which of the partner''s registered pharmacists checked and released it';

-- The pharmacist's work list: shipments still waiting for the check
CREATE INDEX IF NOT EXISTS idx_order_shipments_check_waiting
  ON order_shipments (created_at) WHERE pharmacist_check IN ('pending', 'held') AND status = 'pending';

-- ── 2. Trust page: "Every order is checked by a pharmacist" ──────────────────
-- Sprint 33 seeded version 1 as "How a pharmacist checks your order" because only
-- prescription orders were checked then. Publish version 2 ONLY if the page is still
-- that untouched seed — an admin's own edits are never overwritten.
INSERT INTO info_pages (page_key, version, title, summary, body)
SELECT 'pharmacist-checked', 2, 'Every order is checked by a pharmacist',
 'A registered pharmacist checks every order, with or without prescription medicines, and releases it before anything is packed.',
 '## Every order, before packing
Every order is checked by a registered pharmacist before it is packed, whether or not it has prescription medicines and whether it comes from Dawabag''s own pharmacy or a partner pharmacy. The pharmacist looks at the medicines and quantities you ordered and, if you have chosen to share a health profile, at the allergies and conditions in it. Nothing is packed or dispatched until the pharmacist has released the order.

Your order page shows the name and registration number of the pharmacist who checked it.

## Prescription medicines
Medicines in Schedule H or H1 need a valid prescription. For these orders the pharmacist reads your prescription and checks it against the medicines and quantities in your order as part of the same check.

If the prescription cannot be accepted, the pharmacist tells you why. You can send a new one or cancel the order for a full refund.

## If the pharmacist has a concern
The pharmacist may put your order on hold and contact you, or decline to supply it. If an order is declined, it is cancelled and you get a full refund to the way you paid.

## Schedule H1 register
For Schedule H1 medicines we keep the register the law requires: the patient, the prescriber and the pharmacist who dispensed it.

## Packing
Orders from Dawabag''s own pharmacy are packed by our packing staff only after the pharmacist has released them, and each packed order records who packed it. A shipment cannot be packed while it is waiting for the pharmacist or a batch on it has been recalled.

## Partner pharmacies
Partner pharmacies are licensed pharmacies that name their registered pharmacists to us. A partner''s own registered pharmacist checks and releases the partner''s part of your order before it is packed, and their name and registration number are recorded.

## Questions about a medicine
Ask your doctor, or book an online consultation with a doctor on Dawabag.'
WHERE NOT EXISTS (SELECT 1 FROM info_pages WHERE page_key = 'pharmacist-checked' AND version > 1)
  AND EXISTS (SELECT 1 FROM info_pages WHERE page_key = 'pharmacist-checked' AND version = 1
                AND title = 'How a pharmacist checks your order'
                AND md5(summary) = '6ba5c4d5552608a6fc6c7838bdb0cb7d'
                AND md5(body) = 'b7b7cdcde1719be4c1ffe82c37ee595e')
ON CONFLICT (page_key, version) DO NOTHING;
