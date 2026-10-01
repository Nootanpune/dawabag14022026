-- ─────────────────────────────────────────────────────────────────────────────
-- 13_sprint10_telemedicine.sql — Sprint 10 (teleconsultation, Telemedicine
-- Practice Guidelines 2020; Rulebook C-22, C-23, C-24)
-- Applied by the migration runner. Safe to re-run.
--
-- 1. Doctors: council registration checked by an admin, shown to patients (C-22)
-- 2. Products carry their telemedicine list: O, A, B or prohibited (C-23)
-- 3. Consultations: mode (video / audio / text), first or follow-up, consent, fee
-- 4. E-prescriptions: frozen doctor and patient details, a public check code,
--    final once issued; they reach the pharmacist like any prescription (C-08, C-24)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Doctors ───────────────────────────────────────────────────────────────
ALTER TABLE doctor_profiles
  ADD COLUMN IF NOT EXISTS council            VARCHAR(120),     -- 'National Medical Commission' or the State Medical Council
  ADD COLUMN IF NOT EXISTS registration_year  SMALLINT,
  ADD COLUMN IF NOT EXISTS qualification      VARCHAR(200),     -- e.g. 'MBBS, MD (Medicine)'
  ADD COLUMN IF NOT EXISTS verified_by        UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS verified_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason   TEXT;

-- ── 2. Telemedicine lists on products ────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS telemedicine_list VARCHAR(10)
  CHECK (telemedicine_list IN ('O', 'A', 'B', 'prohibited'));
-- Never by teleconsultation: Schedule X and NDPS. Over-the-counter medicines are List O.
UPDATE products SET telemedicine_list = 'prohibited' WHERE telemedicine_list IS NULL AND drug_schedule IN ('Schedule X', 'NDPS');
UPDATE products SET telemedicine_list = 'O' WHERE telemedicine_list IS NULL AND drug_schedule = 'OTC';
-- Whatever anyone sets, Schedule X and NDPS stay prohibited; a new OTC product starts in List O
CREATE OR REPLACE FUNCTION dawabag_telemedicine_prohibited() RETURNS trigger AS $$
BEGIN
  IF NEW.drug_schedule IN ('Schedule X', 'NDPS') THEN NEW.telemedicine_list := 'prohibited';
  ELSIF NEW.telemedicine_list IS NULL AND NEW.drug_schedule = 'OTC' THEN NEW.telemedicine_list := 'O';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS products_telemedicine_prohibited ON products;
CREATE TRIGGER products_telemedicine_prohibited BEFORE INSERT OR UPDATE OF drug_schedule, telemedicine_list ON products
  FOR EACH ROW EXECUTE FUNCTION dawabag_telemedicine_prohibited();

-- ── 3. Consultations ─────────────────────────────────────────────────────────
ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_type_check;
UPDATE consultations SET type = 'text' WHERE type = 'chat';
ALTER TABLE consultations ADD CONSTRAINT consultations_type_check CHECK (type IN ('video', 'audio', 'text'));
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS chief_complaint     TEXT,
  ADD COLUMN IF NOT EXISTS consult_kind        VARCHAR(10) NOT NULL DEFAULT 'first' CHECK (consult_kind IN ('first', 'follow_up')),
  ADD COLUMN IF NOT EXISTS follow_up_of        UUID REFERENCES consultations(id),
  ADD COLUMN IF NOT EXISTS consent_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_status      VARCHAR(10) NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'waived', 'refunded')),
  ADD COLUMN IF NOT EXISTS gateway_order_id    VARCHAR(100) UNIQUE,
  ADD COLUMN IF NOT EXISTS gateway_payment_id  VARCHAR(100) UNIQUE,
  ADD COLUMN IF NOT EXISTS paid_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gateway_refund_id   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cancelled_by        UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancel_reason       TEXT;
CREATE INDEX IF NOT EXISTS idx_consultations_pair ON consultations(doctor_id, patient_user_id, ended_at);
-- One live booking per slot
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultations_slot ON consultations(slot_id) WHERE status <> 'cancelled';
CREATE UNIQUE INDEX IF NOT EXISTS idx_doctor_slots_unique ON doctor_slots(doctor_id, slot_date, slot_start);

-- ── 4. E-prescriptions ───────────────────────────────────────────────────────
ALTER TABLE digital_prescriptions
  ADD COLUMN IF NOT EXISTS verification_code     VARCHAR(12) UNIQUE,
  ADD COLUMN IF NOT EXISTS consult_kind          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS consult_mode          VARCHAR(10),
  ADD COLUMN IF NOT EXISTS doctor_name           VARCHAR(255),
  ADD COLUMN IF NOT EXISTS doctor_qualification  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS doctor_reg_no         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS doctor_council        VARCHAR(120),
  ADD COLUMN IF NOT EXISTS patient_name          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS patient_age           SMALLINT,
  ADD COLUMN IF NOT EXISTS patient_gender        VARCHAR(10),
  ADD COLUMN IF NOT EXISTS advice                TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_digital_rx_consultation ON digital_prescriptions(consultation_id);
ALTER TABLE digital_prescription_items ADD COLUMN IF NOT EXISTS telemedicine_list VARCHAR(10);

-- An e-prescription reaches the pharmacist as an ordinary, unverified prescription
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS digital_prescription_id UUID UNIQUE REFERENCES digital_prescriptions(id);
ALTER TABLE prescriptions ALTER COLUMN s3_key DROP NOT NULL;
DO $$ BEGIN
  ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_source_check CHECK (s3_key IS NOT NULL OR digital_prescription_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Issued e-prescriptions are final (Telemedicine Guidelines: records kept; C-34)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['digital_prescriptions', 'digital_prescription_items'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_final ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_final BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION dawabag_records_are_final()', t, t);
  END LOOP;
END $$;

INSERT INTO app_settings (key, value, description) VALUES
  ('telemedicine.follow_up_days', '180',
   'A consultation with the same doctor within this many days of the last one is a follow-up (Telemedicine Practice Guidelines 2020)'),
  ('telemedicine.rx_valid_days', '30',
   'Days an e-prescription stays valid for dispensing')
ON CONFLICT (key) DO NOTHING;
