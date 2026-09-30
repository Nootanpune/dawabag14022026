-- ============================================================
-- DAWABAG DATABASE MIGRATION v1.0
-- Run: psql -U dawabag_user -d dawabag -f migration.sql
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USERS & AUTH ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE,
  mobile VARCHAR(15) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer','doctor','pharmacy','pharmacist_rx','pharmacist_pack','delivery','admin','super_admin')),
  mobile_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  fcm_token TEXT,
  preferred_language VARCHAR(10) DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_mobile ON users(mobile) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role ON users(role) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  date_of_birth DATE,
  gender VARCHAR(20) CHECK (gender IN ('male','female','other')),
  wallet_balance_paise INTEGER NOT NULL DEFAULT 0,
  referral_code VARCHAR(20) UNIQUE,
  referred_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_profiles_user_id ON user_profiles(user_id);
CREATE INDEX idx_user_profiles_referral_code ON user_profiles(referral_code);

CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  date_of_birth DATE,
  gender VARCHAR(20),
  relationship VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_patients_owner ON patients(owner_user_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(50) NOT NULL DEFAULT 'Home',
  full_name VARCHAR(255) NOT NULL,
  mobile VARCHAR(15) NOT NULL,
  address_line1 VARCHAR(500) NOT NULL,
  address_line2 VARCHAR(500),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  pincode VARCHAR(10) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_addresses_user_id ON addresses(user_id) WHERE deleted_at IS NULL;

-- ─── WALLET TRANSACTIONS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('credit','debit')),
  amount_paise INTEGER NOT NULL,
  reason VARCHAR(255) NOT NULL,
  reference_id UUID,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_txn_user ON wallet_transactions(user_id);

-- ─── PRODUCTS & INVENTORY ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(500) NOT NULL,
  generic_name VARCHAR(500),
  sku VARCHAR(100) UNIQUE NOT NULL,
  category VARCHAR(100) NOT NULL,
  drug_schedule VARCHAR(20) NOT NULL DEFAULT 'OTC'
    CHECK (drug_schedule IN ('OTC','Schedule G','Schedule H','Schedule H1','Schedule X','NDPS')),
  hsn_code VARCHAR(20),
  gst_rate INTEGER NOT NULL DEFAULT 12,
  marketed_by VARCHAR(255),
  description TEXT,
  composition TEXT,
  storage_instructions TEXT,
  cold_chain BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  mrp_paise INTEGER NOT NULL,
  offer_price_paise INTEGER NOT NULL,
  max_qty_per_order INTEGER NOT NULL DEFAULT 3,
  s3_image_key VARCHAR(500),
  search_vector TSVECTOR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_products_sku ON products(sku) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_category ON products(category) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_schedule ON products(drug_schedule) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_search ON products USING GIN(search_vector);

-- Update search vector trigger
CREATE OR REPLACE FUNCTION update_product_search_vector() RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.name,'') || ' ' ||
    coalesce(NEW.generic_name,'') || ' ' ||
    coalesce(NEW.marketed_by,'')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_search_vector_update
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_product_search_vector();

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  drug_license_no VARCHAR(100) UNIQUE NOT NULL,
  gst_number VARCHAR(20),
  gst_type VARCHAR(30) DEFAULT 'regular'
    CHECK (gst_type IN ('regular','unregistered','composition')),
  contact_name VARCHAR(255),
  contact_mobile VARCHAR(15),
  contact_email VARCHAR(255),
  payment_terms VARCHAR(100) DEFAULT 'prepaid',
  avg_delivery_days INTEGER DEFAULT 3,
  opening_balance_paise INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id),
  vendor_id UUID REFERENCES vendors(id),
  batch_number VARCHAR(100) NOT NULL,
  quantity_available INTEGER NOT NULL DEFAULT 0,
  quantity_reserved INTEGER NOT NULL DEFAULT 0,
  purchase_price_paise INTEGER NOT NULL,
  expiry_date DATE NOT NULL,
  manufactured_date DATE,
  storage_location VARCHAR(100),
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_batches_product_expiry ON inventory_batches(product_id, expiry_date ASC);
CREATE INDEX idx_batches_available ON inventory_batches(product_id) WHERE quantity_available > 0;

-- ─── PURCHASE ORDERS ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  po_number VARCHAR(50) UNIQUE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','confirmed','received','cancelled')),
  total_amount_paise INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  raised_by UUID REFERENCES users(id),
  raised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expected_by DATE,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS po_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price_paise INTEGER NOT NULL,
  gst_rate INTEGER NOT NULL,
  total_paise INTEGER NOT NULL
);

-- ─── COUPONS ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  type VARCHAR(30) NOT NULL
    CHECK (type IN ('flat','percentage','free_shipping','bxgy')),
  value INTEGER NOT NULL,
  min_order_paise INTEGER NOT NULL DEFAULT 0,
  max_discount_paise INTEGER,
  uses_limit INTEGER,
  uses_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coupons_code ON coupons(code) WHERE is_active = TRUE;

-- ─── ORDERS ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(30) UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  patient_id UUID REFERENCES patients(id),
  address_id UUID NOT NULL REFERENCES addresses(id),
  status VARCHAR(50) NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN (
      'pending_payment','payment_failed','rx_pending',
      'rx_verified','rx_rejected','packing',
      'packed','dispatched','delivered','cancelled','returned'
    )),
  subtotal_paise INTEGER NOT NULL,
  discount_paise INTEGER NOT NULL DEFAULT 0,
  shipping_paise INTEGER NOT NULL DEFAULT 0,
  gst_paise INTEGER NOT NULL DEFAULT 0,
  total_paise INTEGER NOT NULL,
  coupon_id UUID REFERENCES coupons(id),
  wallet_used_paise INTEGER NOT NULL DEFAULT 0,
  courier_partner VARCHAR(100),
  awb_number VARCHAR(100),
  tracking_url TEXT,
  estimated_delivery DATE,
  notes TEXT,
  pharmacist_rx_id UUID REFERENCES users(id),
  pharmacist_pack_id UUID REFERENCES users(id),
  rx_verified_at TIMESTAMPTZ,
  packed_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_orders_user ON orders(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_number ON orders(order_number) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  batch_id UUID REFERENCES inventory_batches(id),
  product_name VARCHAR(500) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price_paise INTEGER NOT NULL,
  mrp_paise INTEGER NOT NULL,
  gst_rate INTEGER NOT NULL,
  cgst_paise INTEGER NOT NULL DEFAULT 0,
  sgst_paise INTEGER NOT NULL DEFAULT 0,
  igst_paise INTEGER NOT NULL DEFAULT 0,
  line_total_paise INTEGER NOT NULL
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ─── PRESCRIPTIONS ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prescriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  patient_id UUID REFERENCES patients(id),
  order_id UUID REFERENCES orders(id),
  s3_key VARCHAR(500) NOT NULL,
  original_filename VARCHAR(255),
  file_type VARCHAR(20),
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','rejected','expired')),
  rejection_reason TEXT,
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  valid_until DATE,
  is_digital BOOLEAN NOT NULL DEFAULT FALSE,
  doctor_name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prescriptions_order ON prescriptions(order_id, status);
CREATE INDEX idx_prescriptions_user ON prescriptions(user_id, valid_until);

-- ─── PAYMENTS ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id),
  gateway VARCHAR(30) NOT NULL DEFAULT 'razorpay',
  gateway_order_id VARCHAR(255) UNIQUE,
  gateway_payment_id VARCHAR(255) UNIQUE,
  gateway_signature VARCHAR(500),
  status VARCHAR(30) NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','authorized','captured','failed','refunded')),
  amount_paise INTEGER NOT NULL,
  method VARCHAR(50),
  wallet_used_paise INTEGER NOT NULL DEFAULT 0,
  refund_amount_paise INTEGER,
  refund_id VARCHAR(255),
  refunded_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_gateway_order ON payments(gateway_order_id);

-- ─── REFILL SUBSCRIPTIONS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS refill_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id),
  user_id UUID NOT NULL REFERENCES users(id),
  frequency_days INTEGER NOT NULL DEFAULT 30,
  next_refill_date DATE NOT NULL,
  auto_charge BOOLEAN NOT NULL DEFAULT FALSE,
  auto_charge_consent_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_reminded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refill_next_date ON refill_subscriptions(next_refill_date) WHERE is_active = TRUE;

-- ─── DOCTOR PORTAL ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS doctor_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  clinic_name VARCHAR(255),
  speciality VARCHAR(100),
  nmc_reg_number VARCHAR(100) UNIQUE NOT NULL,
  reg_cert_s3_key VARCHAR(500),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  consultation_fee_paise INTEGER NOT NULL DEFAULT 50000,
  bio TEXT,
  languages_spoken TEXT[],
  bonus_points INTEGER NOT NULL DEFAULT 0,
  points_expire_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doctor_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
  slot_date DATE NOT NULL,
  slot_start TIME NOT NULL,
  slot_end TIME NOT NULL,
  is_booked BOOLEAN NOT NULL DEFAULT FALSE,
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_doctor_slots ON doctor_slots(doctor_id, slot_date, is_booked);

CREATE TABLE IF NOT EXISTS consultations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id),
  patient_user_id UUID NOT NULL REFERENCES users(id),
  patient_id UUID REFERENCES patients(id),
  slot_id UUID REFERENCES doctor_slots(id),
  type VARCHAR(20) NOT NULL DEFAULT 'video' CHECK (type IN ('video','chat')),
  status VARCHAR(30) NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','in_progress','completed','cancelled','no_show')),
  fee_paise INTEGER NOT NULL,
  agora_channel VARCHAR(255),
  payment_id UUID REFERENCES payments(id),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS digital_prescriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  consultation_id UUID NOT NULL REFERENCES consultations(id),
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id),
  patient_user_id UUID NOT NULL REFERENCES users(id),
  patient_id UUID REFERENCES patients(id),
  diagnosis TEXT NOT NULL,
  telemedicine_issued BOOLEAN NOT NULL DEFAULT TRUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until DATE NOT NULL,
  s3_key VARCHAR(500)
);

CREATE TABLE IF NOT EXISTS digital_prescription_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prescription_id UUID NOT NULL REFERENCES digital_prescriptions(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  medicine_name VARCHAR(500) NOT NULL,
  dosage VARCHAR(100),
  frequency VARCHAR(100),
  duration_days INTEGER,
  instructions TEXT
);

CREATE TABLE IF NOT EXISTS doctor_referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_id UUID NOT NULL REFERENCES doctor_profiles(id),
  code VARCHAR(30) NOT NULL,
  redeemed_by UUID REFERENCES users(id),
  order_id UUID REFERENCES orders(id),
  discount_pct INTEGER NOT NULL DEFAULT 12,
  points_earned INTEGER NOT NULL DEFAULT 15,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PHARMACY PROFILES ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pharmacy_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  pharmacy_name VARCHAR(255) NOT NULL,
  drug_license_no VARCHAR(100) UNIQUE NOT NULL,
  food_license_no VARCHAR(100),
  gst_number VARCHAR(20),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  payment_terms VARCHAR(30) NOT NULL DEFAULT 'prepaid',
  credit_limit_paise INTEGER NOT NULL DEFAULT 0,
  outstanding_paise INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── NOTIFICATIONS ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  data JSONB,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, sent_at DESC);

-- ─── AUDIT LOG ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100),
  entity_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity, entity_id);

-- ─── PIN CODE SERVICEABILITY ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pincode_serviceability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pincode VARCHAR(10) UNIQUE NOT NULL,
  city VARCHAR(100),
  state VARCHAR(100),
  is_serviceable BOOLEAN NOT NULL DEFAULT TRUE,
  shipping_charge_paise INTEGER NOT NULL DEFAULT 4900,
  estimated_days INTEGER NOT NULL DEFAULT 5,
  cold_chain_available BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pincode ON pincode_serviceability(pincode);

-- ─── UPDATED_AT TRIGGER ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refill_updated_at BEFORE UPDATE ON refill_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
