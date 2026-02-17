// =====================================================
// DAWABAG - Drizzle Database Schema
// =====================================================

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// Users
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  mobile: text('mobile').notNull(),
  passwordHash: text('password_hash').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  role: text('role', { enum: ['customer', 'doctor', 'pharmacy'] }).notNull().default('customer'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  referralCode: text('referral_code').unique(),
  referredBy: text('referred_by'),
  walletBalance: real('wallet_balance').notNull().default(0),
  loyaltyPoints: integer('loyalty_points').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Addresses
export const addresses = sqliteTable('addresses', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  type: text('type', { enum: ['shipping', 'billing'] }).notNull(),
  name: text('name').notNull(),
  mobile: text('mobile').notNull(),
  addressLine1: text('address_line_1').notNull(),
  addressLine2: text('address_line_2'),
  landmark: text('landmark'),
  city: text('city').notNull(),
  state: text('state').notNull(),
  pincode: text('pincode').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
});

// Patients
export const patients = sqliteTable('patients', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  gender: text('gender', { enum: ['male', 'female', 'other'] }).notNull(),
  age: integer('age').notNull(),
  weight: integer('weight'),
  height: integer('height'),
  medicalHistory: text('medical_history'), // JSON array
  allergies: text('allergies'), // JSON array
  chronicConditions: text('chronic_conditions'), // JSON array
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Medicines
export const medicines = sqliteTable('medicines', {
  id: text('id').primaryKey(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  genericName: text('generic_name').notNull(),
  brandName: text('brand_name').notNull(),
  saltComposition: text('salt_composition').notNull(),
  manufacturer: text('manufacturer').notNull(),
  description: text('description').notNull(),
  usage: text('usage'),
  sideEffects: text('side_effects'), // JSON array
  precautions: text('precautions'), // JSON array
  storageInstructions: text('storage_instructions'),
  category: text('category').notNull(),
  dosageForm: text('dosage_form').notNull(),
  strength: text('strength').notNull(),
  packSize: integer('pack_size').notNull(),
  unit: text('unit').notNull(),
  mrp: real('mrp').notNull(),
  offerPrice: real('offer_price').notNull(),
  discount: real('discount').notNull(),
  stock: integer('stock').notNull().default(0),
  minStockLevel: integer('min_stock_level').notNull().default(20),
  reorderLevel: integer('reorder_level').notNull().default(10),
  requiresPrescription: integer('requires_prescription', { mode: 'boolean' }).notNull().default(false),
  isScheduledDrug: integer('is_scheduled_drug', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Cart Items
export const cartItems = sqliteTable('cart_items', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  medicineId: text('medicine_id').notNull().references(() => medicines.id),
  quantity: integer('quantity').notNull().default(1),
  price: real('price').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Orders
export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(),
  userId: text('user_id').notNull().references(() => users.id),
  patientId: text('patient_id').references(() => patients.id),
  subtotal: real('subtotal').notNull(),
  discount: real('discount').notNull().default(0),
  couponDiscount: real('coupon_discount').notNull().default(0),
  referralDiscount: real('referral_discount').notNull().default(0),
  shippingCharges: real('shipping_charges').notNull().default(0),
  gstAmount: real('gst_amount').notNull().default(0),
  total: real('total').notNull(),
  paymentMethod: text('payment_method'),
  paymentStatus: text('payment_status').notNull().default('pending'),
  paymentId: text('payment_id'),
  orderStatus: text('order_status').notNull().default('pending'),
  prescriptionId: text('prescription_id'),
  prescriptionStatus: text('prescription_status'),
  isRefillOrder: integer('is_refill_order', { mode: 'boolean' }).notNull().default(false),
  refilledFromOrderId: text('refilled_from_order_id'),
  pincode: text('pincode').notNull(),
  doctorReferralCode: text('doctor_referral_code'),
  doctorId: text('doctor_id'),
  expectedDeliveryDate: text('expected_delivery_date'),
  deliveredAt: text('delivered_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Order Items
export const orderItems = sqliteTable('order_items', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().references(() => orders.id),
  medicineId: text('medicine_id').notNull().references(() => medicines.id),
  medicineName: text('medicine_name').notNull(),
  genericName: text('generic_name'),
  brandName: text('brand_name'),
  strength: text('strength').notNull(),
  dosageForm: text('dosage_form').notNull(),
  packSize: integer('pack_size').notNull(),
  quantity: integer('quantity').notNull(),
  mrp: real('mrp').notNull(),
  offerPrice: real('offer_price').notNull(),
  discount: real('discount').notNull().default(0),
  total: real('total').notNull(),
});

// Prescriptions
export const prescriptions = sqliteTable('prescriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  patientId: text('patient_id').references(() => patients.id),
  orderId: text('order_id').references(() => orders.id),
  images: text('images').notNull(), // JSON array of image URLs
  isValid: integer('is_valid', { mode: 'boolean' }).notNull().default(true),
  validityPeriod: integer('validity_period').notNull().default(30),
  expiryDate: text('expiry_date').notNull(),
  status: text('status').notNull().default('pending'),
  verifiedBy: text('verified_by'),
  verifiedAt: text('verified_at'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Vendors
export const vendors = sqliteTable('vendors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  mobile: text('mobile').notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  pincode: text('pincode').notNull(),
  drugLicenseNumber: text('drug_license_number').notNull(),
  drugLicenseDocument: text('drug_license_document'),
  gstNumber: text('gst_number').notNull(),
  gstType: text('gst_type').notNull().default('regular'),
  openingBalance: real('opening_balance').notNull().default(0),
  balanceType: text('balance_type').notNull().default('payable'),
  productsSupplied: text('products_supplied'), // JSON array
  deliveryTime: integer('delivery_time').notNull().default(3),
  paymentTerms: text('payment_terms').notNull().default('Net 30'),
  rating: real('rating'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Purchase Orders
export const purchaseOrders = sqliteTable('purchase_orders', {
  id: text('id').primaryKey(),
  poNumber: text('po_number').notNull().unique(),
  vendorId: text('vendor_id').notNull().references(() => vendors.id),
  subtotal: real('subtotal').notNull(),
  gstAmount: real('gst_amount').notNull(),
  total: real('total').notNull(),
  status: text('status').notNull().default('draft'),
  expectedDeliveryDate: text('expected_delivery_date'),
  actualDeliveryDate: text('actual_delivery_date'),
  notes: text('notes'),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// Purchase Order Items
export const purchaseOrderItems = sqliteTable('purchase_order_items', {
  id: text('id').primaryKey(),
  purchaseOrderId: text('purchase_order_id').notNull().references(() => purchaseOrders.id),
  medicineId: text('medicine_id').notNull().references(() => medicines.id),
  quantity: integer('quantity').notNull(),
  rate: real('rate').notNull(),
  gst: real('gst').notNull(),
  total: real('total').notNull(),
});

// Coupons
export const coupons = sqliteTable('coupons', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  description: text('description'),
  type: text('type', { enum: ['percentage', 'fixed', 'shipping'] }).notNull(),
  value: real('value').notNull(),
  minOrderAmount: real('min_order_amount').notNull().default(0),
  maxDiscount: real('max_discount'),
  usageLimit: integer('usage_limit'),
  usageCount: integer('usage_count').notNull().default(0),
  perUserLimit: integer('per_user_limit').notNull().default(1),
  validFrom: text('valid_from').notNull(),
  validUntil: text('valid_until').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
});

// Pincode Services
export const pincodeServices = sqliteTable('pincode_services', {
  id: text('id').primaryKey(),
  pincode: text('pincode').notNull().unique(),
  area: text('area').notNull(),
  city: text('city').notNull(),
  state: text('state').notNull(),
  isDeliverable: integer('is_deliverable', { mode: 'boolean' }).notNull().default(true),
  deliveryDays: integer('delivery_days').notNull().default(3),
  deliveryCharges: real('delivery_charges').notNull().default(49),
  codAvailable: integer('cod_available', { mode: 'boolean' }).notNull().default(false),
  expressDelivery: integer('express_delivery', { mode: 'boolean' }).notNull().default(true),
  expressCharges: real('express_charges').notNull().default(99),
  updatedAt: text('updated_at').notNull(),
});
