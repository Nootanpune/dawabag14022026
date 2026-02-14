// =====================================================
// DAWABAG - TypeScript Type Definitions
// Addressing all gaps from URS analysis
// =====================================================

// =====================================================
// ENUMS
// =====================================================

export enum UserRole {
  CUSTOMER = 'customer',
  DOCTOR = 'doctor',
  PHARMACY = 'pharmacy',
  PHARMACIST = 'pharmacist',
  PACKING_STAFF = 'packing_staff',
  DELIVERY_STAFF = 'delivery_staff',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}

export enum OrderStatus {
  PENDING = 'pending',
  PAYMENT_VERIFIED = 'payment_verified',
  PRESCRIPTION_PENDING = 'prescription_pending',
  PRESCRIPTION_VERIFIED = 'prescription_verified',
  PRESCRIPTION_REJECTED = 'prescription_rejected',
  PENDING_PACKING = 'pending_packing',
  PACKED = 'packed',
  DISPATCHED = 'dispatched',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  NET_BANKING = 'net_banking',
  UPI = 'upi',
  WALLET = 'wallet',
}

export enum PaymentTerms {
  PREPAID = 'prepaid',
  POST_PAID = 'post_paid',
}

export enum PrescriptionStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

export enum VerificationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum GSTType {
  REGULAR = 'regular',
  UNREGISTERED = 'unregistered',
  COMPOSITION = 'composition',
}

export enum StockAlertLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  CRITICAL = 'critical',
}

// =====================================================
// CUSTOMER TYPES
// =====================================================

export interface Customer {
  id: string;
  email: string;
  mobile: string;
  password: string;
  firstName: string;
  lastName: string;
  gender?: 'male' | 'female' | 'other';
  dateOfBirth?: string;
  isMobileVerified: boolean;
  isEmailVerified: boolean;
  isActive: boolean;
  referralCode: string;
  referredBy?: string;
  walletBalance: number;
  loyaltyPoints: number;
  welcomeOfferUsed: boolean;
  createdAt: string;
  updatedAt: string;
  addresses: Address[];
  patients: Patient[];
  wishlist: string[];
  orders: Order[];
  prescriptions: Prescription[];
}

export interface Address {
  id: string;
  type: 'shipping' | 'billing';
  name: string;
  mobile: string;
  addressLine1: string;
  addressLine2?: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export interface Patient {
  id: string;
  customerId: string;
  name: string;
  gender: 'male' | 'female' | 'other';
  age: number;
  weight?: number;
  height?: number;
  medicalHistory?: string[];
  allergies?: string[];
  chronicConditions?: string[];
  prescriptions: Prescription[];
  createdAt: string;
  updatedAt: string;
}

// =====================================================
// DOCTOR TYPES
// =====================================================

export interface Doctor {
  id: string;
  email: string;
  mobile: string;
  password: string;
  firstName: string;
  lastName: string;
  registrationNumber: string;
  clinicName: string;
  specialty: string;
  qualification: string;
  experience: number;
  clinicAddress: string;
  city: string;
  state: string;
  pincode: string;
  profileImage?: string;
  licenseDocument: string;
  isVerified: boolean;
  verificationStatus: VerificationStatus;
  referralCode: string;
  bonusPoints: number;
  pointsRedeemed: number;
  referralEarnings: number;
  isActive: boolean;
  isAvailableForConsultation: boolean;
  createdAt: string;
  updatedAt: string;
  patients: DoctorPatient[];
  redemptions: ReferralRedemption[];
}

export interface DoctorPatient {
  id: string;
  doctorId: string;
  customerId: string;
  patientName: string;
  mobile: string;
  notes?: string;
  createdAt: string;
}

export interface ReferralRedemption {
  id: string;
  doctorId: string;
  customerId: string;
  orderId: string;
  pointsEarned: number;
  discountAvailed: number;
  redeemedAt: string;
}

// =====================================================
// PHARMACY TYPES
// =====================================================

export interface Pharmacy {
  id: string;
  email: string;
  mobile: string;
  password: string;
  pharmacyName: string;
  ownerName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  drugLicenseNumber: string;
  drugLicenseDocument: string;
  foodLicenseNumber?: string;
  foodLicenseDocument?: string;
  gstNumber: string;
  gstType: GSTType;
  kycDocuments: string[];
  paymentTerms: PaymentTerms;
  creditLimit?: number;
  currentCreditUsed?: number;
  isVerified: boolean;
  verificationStatus: VerificationStatus;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  orders: Order[];
}

// =====================================================
// MEDICINE TYPES
// =====================================================

export interface Medicine {
  id: string;
  sku: string;
  name: string;
  genericName: string;
  brandName: string;
  saltComposition: string;
  manufacturer: string;
  description: string;
  usage: string;
  sideEffects?: string[];
  precautions?: string[];
  storageInstructions: string;
  category: string;
  subCategory?: string;
  dosageForm: 'tablet' | 'capsule' | 'syrup' | 'injection' | 'ointment' | 'drops' | 'inhaler' | 'other';
  strength: string;
  packSize: number;
  unit: string;
  mrp: number;
  offerPrice: number;
  discount: number;
  stock: number;
  minStockLevel: number;
  reorderLevel: number;
  requiresPrescription: boolean;
  isScheduledDrug: boolean;
  scheduleType?: 'H' | 'X' | 'G' | 'Other';
  drugInteractions?: string[];
  ageRestriction?: number;
  images: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MedicineAlternative {
  medicineId: string;
  alternativeId: string;
  isExact: boolean;
}

export interface CartItem {
  medicineId: string;
  quantity: number;
  price: number;
  prescriptionId?: string;
}

export interface Cart {
  id: string;
  customerId: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  shippingCharges: number;
  total: number;
  couponCode?: string;
  updatedAt: string;
}

// =====================================================
// ORDER TYPES
// =====================================================

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  patientId?: string;
  items: OrderItem[];
  shippingAddress: Address;
  billingAddress: Address;
  subtotal: number;
  discount: number;
  couponDiscount: number;
  referralDiscount: number;
  shippingCharges: number;
  gstAmount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentId?: string;
  orderStatus: OrderStatus;
  prescriptionId?: string;
  prescriptionStatus?: PrescriptionStatus;
  isRefillOrder: boolean;
  refilledFromOrderId?: string;
  expectedDeliveryDate?: string;
  deliveredAt?: string;
  pincode: string;
  doctorReferralCode?: string;
  doctorId?: string;
  pharmacyId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  medicineId: string;
  medicineName: string;
  genericName: string;
  brandName: string;
  strength: string;
  dosageForm: string;
  packSize: number;
  quantity: number;
  mrp: number;
  offerPrice: number;
  discount: number;
  total: number;
}

export interface OrderTimeline {
  id: string;
  orderId: string;
  status: OrderStatus;
  description: string;
  createdBy: string;
  createdAt: string;
}

// =====================================================
// PRESCRIPTION TYPES
// =====================================================

export interface Prescription {
  id: string;
  customerId: string;
  patientId: string;
  orderId?: string;
  images: string[];
  isValid: boolean;
  validityPeriod: number;
  expiryDate: string;
  status: PrescriptionStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// =====================================================
// INVENTORY TYPES
// =====================================================

export interface InventoryItem {
  id: string;
  medicineId: string;
  batchNumber: string;
  quantity: number;
  openingStock: number;
  receivedQuantity: number;
  soldQuantity: number;
  damagedQuantity: number;
  returnedQuantity: number;
  expiryDate: string;
  manufacturingDate: string;
  vendorId: string;
  purchaseRate: number;
  mrp: number;
  warehouseId: string;
  rackLocation?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryAlert {
  id: string;
  medicineId: string;
  medicineName: string;
  currentStock: number;
  alertLevel: StockAlertLevel;
  message: string;
  isResolved: boolean;
  createdAt: string;
  resolvedAt?: string;
}

export interface StockMovement {
  id: string;
  medicineId: string;
  type: 'purchase' | 'sale' | 'return' | 'adjustment' | 'transfer';
  quantity: number;
  previousStock: number;
  newStock: number;
  referenceId: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

// =====================================================
// VENDOR TYPES
// =====================================================

export interface Vendor {
  id: string;
  name: string;
  email: string;
  mobile: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  drugLicenseNumber: string;
  drugLicenseDocument: string;
  gstNumber: string;
  gstType: GSTType;
  openingBalance: number;
  balanceType: 'payable' | 'receivable';
  productsSupplied: string[];
  deliveryTime: number;
  paymentTerms: string;
  kycDocuments: string[];
  isActive: boolean;
  rating?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorId: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  gstAmount: number;
  total: number;
  status: 'draft' | 'sent' | 'acknowledged' | 'received' | 'cancelled';
  expectedDeliveryDate: string;
  actualDeliveryDate?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  medicineId: string;
  quantity: number;
  rate: number;
  gst: number;
  total: number;
}

export interface DebitCreditNote {
  id: string;
  noteNumber: string;
  type: 'debit' | 'credit';
  vendorId: string;
  purchaseOrderId?: string;
  amount: number;
  gstAmount: number;
  total: number;
  reason: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

// =====================================================
// COURIER TYPES
// =====================================================

export interface CourierPartner {
  id: string;
  name: string;
  contactNumber: string;
  email: string;
  address: string;
  trackingUrl: string;
  apiKey?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Shipment {
  id: string;
  orderId: string;
  courierPartnerId: string;
  trackingId: string;
  trackingUrl: string;
  status: 'created' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | 'returned';
  pickedUpAt?: string;
  estimatedDelivery?: string;
  actualDelivery?: string;
  currentLocation?: string;
  createdAt: string;
  updatedAt: string;
}

// =====================================================
// COUPON TYPES
// =====================================================

export interface Coupon {
  id: string;
  code: string;
  description: string;
  type: 'percentage' | 'fixed';
  value: number;
  minOrderAmount: number;
  maxDiscount: number;
  applicableCategories?: string[];
  applicableMedicines?: string[];
  validFrom: string;
  validUntil: string;
  usageLimit: number;
  usageCount: number;
  perUserLimit: number;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export interface CouponUsage {
  id: string;
  couponId: string;
  customerId: string;
  orderId: string;
  discountAmount: number;
  usedAt: string;
}

// =====================================================
// REFERRAL TYPES
// =====================================================

export interface Referral {
  id: string;
  referrerId: string;
  referrerType: 'customer' | 'doctor';
  referralCode: string;
  refereeId?: string;
  refereeOrderId?: string;
  discountAvailed: number;
  bonusPointsAwarded: number;
  referralEarnings: number;
  status: 'pending' | 'completed' | 'expired';
  createdAt: string;
  completedAt?: string;
}

// =====================================================
// REPORT TYPES
// =====================================================

export interface SalesReport {
  date: string;
  totalOrders: number;
  totalSales: number;
  gstCollected: number;
  discounts: number;
  netSales: number;
}

export interface StockReport {
  medicineId: string;
  medicineName: string;
  category: string;
  currentStock: number;
  minStockLevel: number;
  reorderLevel: number;
  stockValue: number;
  expiryDate?: string;
}

export interface GSTRReport {
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  gstin?: string;
  placeOfSupply: string;
  reverseCharge: boolean;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  total: number;
}

// =====================================================
// NOTIFICATION TYPES
// =====================================================

export interface Notification {
  id: string;
  userId: string;
  userType: UserRole;
  title: string;
  message: string;
  type: 'order' | 'payment' | 'prescription' | 'promotional' | 'system';
  isRead: boolean;
  data?: Record<string, unknown>;
  createdAt: string;
}

// =====================================================
// SUPPORT TYPES
// =====================================================

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  customerId: string;
  subject: string;
  description: string;
  category: 'order' | 'payment' | 'prescription' | 'account' | 'technical' | 'other';
  priority: 'low' | 'medium' | 'high';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  assignedTo?: string;
  messages: TicketMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderType: UserRole;
  message: string;
  attachments?: string[];
  createdAt: string;
}

// =====================================================
// ADMIN STAFF TYPES
// =====================================================

export interface AdminStaff {
  id: string;
  email: string;
  mobile: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Exclude<UserRole, 'customer' | 'doctor' | 'pharmacy'>;
  permissions: string[];
  isActive: boolean;
  isSuperAdmin: boolean;
  lastLogin?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userType: UserRole;
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
}

// =====================================================
// PINCODE TYPES
// =====================================================

export interface PincodeService {
  id: string;
  pincode: string;
  area: string;
  city: string;
  state: string;
  isDeliverable: boolean;
  deliveryDays: number;
  deliveryCharges: number;
  codAvailable: boolean;
  expressDelivery: boolean;
  expressCharges: number;
  updatedAt: string;
}

// =====================================================
// API RESPONSE TYPES
// =====================================================

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data?: T;
  errors?: Record<string, string[]>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
