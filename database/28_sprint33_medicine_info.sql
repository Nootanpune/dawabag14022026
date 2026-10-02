-- ============================================================
-- Sprint 33 — medicine information, trust pages, dose reminders and the
-- health profile.
--   1. product_info_versions: structured medicine information written by our
--      pharmacist from the manufacturer's package insert / prescribing
--      information. Versioned: buyers only ever see the one APPROVED version;
--      a change is a new draft that goes through the C-19 content review
--      (claims checked, C-17) before it replaces the live text. Every save,
--      submission and decision is audited (C-46).
--   2. info_pages: short trust pages ("Genuine medicines", "Expired, damaged
--      and recalled medicines", "How a pharmacist checks your order") kept on
--      the server, versioned, so admins can change them later without a release.
--   3. medicine_reminders + reminder_dose_logs: "My medicines" dose reminders.
--      The schedule lives only here (standing rule: server is the single source
--      of truth); the app re-schedules phone alerts from this list.
--   4. health_profiles (+ family members in the existing patients table):
--      allergies, conditions and current medicines, kept only with the buyer's
--      explicit consent (DPDP, C-41) and deletable at any time (C-43, C-44).
-- Re-runnable (IF NOT EXISTS / DROP ... IF EXISTS / ON CONFLICT).
-- ============================================================

-- ── 1. Medicine information (C-17, C-19, C-46) ────────────────────────────────
CREATE TABLE IF NOT EXISTS product_info_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version         INTEGER NOT NULL CHECK (version >= 1),
  status          VARCHAR(16) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'superseded')),
  content         JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- possible forbidden claims found in the text (claimsCheck, C-19); shown to the reviewer
  flags           JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  submitted_at    TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  review_notes    TEXT,
  -- the review record as it was signed: name and State Pharmacy Council number (C-19)
  reviewer_name   VARCHAR(255),
  reviewer_reg_no VARCHAR(50),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, version),
  -- an approved version always names who approved it, with their registration
  CONSTRAINT product_info_approved_signed CHECK (status NOT IN ('approved', 'superseded')
    OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND reviewer_reg_no IS NOT NULL))
);
-- at most one version being written or waiting for review, and one live version
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_info_one_open ON product_info_versions(product_id)
  WHERE status IN ('draft', 'pending_review');
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_info_one_live ON product_info_versions(product_id)
  WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_product_info_pending ON product_info_versions(submitted_at)
  WHERE status = 'pending_review';

-- ── 2. Trust pages (C-04, C-08, C-27, C-28, C-37) ─────────────────────────────
CREATE TABLE IF NOT EXISTS info_pages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_key      VARCHAR(40) NOT NULL CHECK (page_key IN ('genuine-medicines', 'expired-damaged-recalled', 'pharmacist-checked')),
  version       INTEGER NOT NULL CHECK (version >= 1),
  title         VARCHAR(120) NOT NULL,
  summary       VARCHAR(300) NOT NULL,
  -- plain text: blank line = new paragraph, "## " = heading, "- " = list item;
  -- {{tokens}} are filled from the live settings when the page is shown
  body          TEXT NOT NULL,
  published_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  published_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (page_key, version)
);

INSERT INTO info_pages (page_key, version, title, summary, body) VALUES
('genuine-medicines', 1, 'Genuine medicines',
 'Every medicine comes from a licensed seller, is tracked by batch and is billed on an invoice that names the seller''s drug licences.',
 '## Who sells to you
Medicines are sold either by Dawabag''s own licensed pharmacy or by a partner pharmacy we have approved. A partner can sell only while its drug licences are checked and in date; if a licence lapses, its stock stops being offered until the renewal is checked.

## Where our stock comes from
Dawabag buys only from suppliers whose wholesale or manufacturing drug licences we have recorded. A purchase order or goods receipt is refused when the supplier''s licence has lapsed.

## Tracked by batch
Every pack we receive is recorded with its batch number and expiry date. Your order records which batch was supplied, so it can be traced later.

## Your invoice
Each shipment comes with a tax invoice from the seller of record. The invoice prints the seller''s name, GSTIN and drug licence numbers.

## Recalls
When a regulator or manufacturer recalls a batch, we match it against our stock and stop selling it. Buyers who received that batch are told.'),
('expired-damaged-recalled', 1, 'Expired, damaged and recalled medicines',
 'How we keep expired and recalled medicines out of your order, and what to do if something arrives damaged or wrong.',
 '## We do not sell short-dated stock
We never supply a batch that expires within {{sell_min_shelf_days}} days. The product page shows the expiry of the batch that would be sent to you ("Expires on or after").

## Stock we receive
New stock must have at least {{receive_min_shelf_days}} days of shelf life when it arrives. Expired stock is never sold: each day it is set aside for write-off and its destruction is recorded.

## Recalled batches
When a recall or "not of standard quality" alert is received, the batch is matched against our stock and blocked: it cannot be sold, packed or dispatched. Buyers who received it are told what to do.

## If something is wrong with your order
- Damaged, wrong or missing items: tell us within {{returns_report_hours}} hours of delivery.
- Expired, near expiry (less than {{returns_near_expiry_days}} days left) or a quality problem: tell us within {{returns_expiry_claim_days}} days of delivery.
- A recalled batch: tell us at any time.

Raise a return from your order page. We do not take back medicines because you changed your mind.

## What happens to returned medicines
Returned medicines are never sold again. They are destroyed or sent back to the supplier, and that is recorded.'),
('pharmacist-checked', 1, 'How a pharmacist checks your order',
 'Prescriptions are checked by a registered pharmacist before anything is packed, and packing is recorded against the person who did it.',
 '## Prescription medicines
Medicines in Schedule H or H1 need a valid prescription. A registered pharmacist reads your prescription and checks it against the medicines and quantities in your order before anything is packed. Nothing on that order is packed or dispatched until the pharmacist has approved it.

If the prescription cannot be accepted, the pharmacist tells you why. You can send a new one or cancel the order for a full refund.

## Schedule H1 register
For Schedule H1 medicines we keep the register the law requires: the patient, the prescriber and the pharmacist who dispensed it.

## Packing
Orders from Dawabag''s own pharmacy are packed by our packing staff, and each packed order records who packed it. A shipment cannot be packed while a prescription line is still unchecked or a batch on it has been recalled.

## Partner pharmacies
Partner pharmacies are licensed pharmacies that name their registered pharmacists to us.

## Questions about a medicine
Ask your doctor, or book an online consultation with a doctor on Dawabag.')
ON CONFLICT (page_key, version) DO NOTHING;

-- ── 3. Dose reminders ("My medicines") ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS medicine_reminders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id     UUID REFERENCES products(id) ON DELETE SET NULL,
  medicine_name  VARCHAR(200) NOT NULL CHECK (length(btrim(medicine_name)) >= 2),
  dose           VARCHAR(80),                          -- e.g. '1 tablet'
  -- times of day in India (HH:MM, 24-hour), sorted, 1 to 6
  times          TEXT[] NOT NULL CHECK (cardinality(times) BETWEEN 1 AND 6),
  start_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date       DATE,                                 -- NULL = until switched off
  source         VARCHAR(10) NOT NULL DEFAULT 'manual' CHECK (source IN ('order', 'manual')),
  order_id       UUID REFERENCES orders(id) ON DELETE SET NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT medicine_reminders_dates CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_medicine_reminders_user ON medicine_reminders(user_id, is_active);

-- Taken / skipped taps (adherence). One answer per dose; a later tap replaces it.
CREATE TABLE IF NOT EXISTS reminder_dose_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id    UUID NOT NULL REFERENCES medicine_reminders(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scheduled_for  TIMESTAMPTZ NOT NULL,
  status         VARCHAR(8) NOT NULL CHECK (status IN ('taken', 'skipped')),
  recorded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reminder_id, scheduled_for)
);
CREATE INDEX IF NOT EXISTS idx_reminder_dose_logs_user ON reminder_dose_logs(user_id, scheduled_for DESC);

-- ── 4. Health profile (DPDP; C-41 consent, C-43/C-44 deletion) ────────────────
ALTER TABLE consent_records DROP CONSTRAINT IF EXISTS consent_records_purpose_check;
ALTER TABLE consent_records ADD CONSTRAINT consent_records_purpose_check
  CHECK (purpose IN ('privacy_notice', 'age_18_plus', 'marketing', 'practitioner_declaration', 'whatsapp', 'health_profile'));

CREATE TABLE IF NOT EXISTS health_profiles (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  allergies          JSONB NOT NULL DEFAULT '[]'::jsonb,   -- list of short texts
  conditions         JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_medicines  JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- the consent this data is held under (the consent_records row is the log)
  consent_version    VARCHAR(40) NOT NULL,
  consented_at       TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Family members are the account's existing patients (one list, also used to book
-- consultations and on orders); the health profile adds an age and their own
-- allergies / conditions.
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS age_years       SMALLINT CHECK (age_years IS NULL OR age_years BETWEEN 0 AND 120),
  ADD COLUMN IF NOT EXISTS age_recorded_on DATE,
  ADD COLUMN IF NOT EXISTS allergies       JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS conditions      JSONB NOT NULL DEFAULT '[]'::jsonb;
