// =====================================================
// DAWABAG - Utility Functions
// Addressing security and validation gaps
// =====================================================

import type { 
  Customer, 
  Doctor, 
  Pharmacy, 
  Medicine, 
  Order, 
  Prescription,
  Coupon,
  PincodeService
} from '@/types';

// =====================================================
// SECURITY UTILITIES
// =====================================================

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  const array = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  for (let i = 0; i < length; i++) {
    token += chars[array[i] % chars.length];
  }
  return token;
}

/**
 * Generate a unique ID
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const randomPart = generateToken(8);
  return prefix ? `${prefix}_${timestamp}${randomPart}` : `${timestamp}${randomPart}`;
}

/**
 * Generate order number
 */
export function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = generateToken(4).toUpperCase();
  return `DWB-${timestamp}-${random}`;
}

/**
 * Generate PO number
 */
export function generatePONumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `PO-${year}-${random}`;
}

/**
 * Hash password (using bcrypt in production)
 * This is a placeholder - use bcrypt in actual implementation
 */
export async function hashPassword(password: string): Promise<string> {
  // In production, use bcrypt
  // const salt = await bcrypt.genSalt(10);
  // return await bcrypt.hash(password, salt);
  return Buffer.from(password).toString('base64');
}

/**
 * Compare password
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  // In production, use bcrypt.compare
  return Buffer.from(password).toString('base64') === hash;
}

// =====================================================
// VALIDATION UTILITIES
// =====================================================

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate Indian mobile number
 */
export function isValidMobile(mobile: string): boolean {
  const mobileRegex = /^[6-9]\d{9}$/;
  return mobileRegex.test(mobile);
}

/**
 * Validate PIN code
 */
export function isValidPincode(pincode: string): boolean {
  const pincodeRegex = /^[1-9]\d{5}$/;
  return pincodeRegex.test(pincode);
}

/**
 * Validate GST number
 */
export function isValidGST(gstNumber: string): boolean {
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstRegex.test(gstNumber);
}

/**
 * Validate drug license number (format varies by state)
 */
export function isValidDrugLicense(license: string): boolean {
  // Basic validation - 14-20 characters alphanumeric
  const licenseRegex = /^[A-Z]{2}\d{12,17}$/;
  return licenseRegex.test(license);
}

/**
 * Validate prescription expiry
 */
export function isPrescriptionValid(prescription: Prescription): boolean {
  if (prescription.status !== 'verified') return false;
  const expiryDate = new Date(prescription.expiryDate);
  return expiryDate > new Date();
}

/**
 * Calculate prescription expiry date
 */
export function calculatePrescriptionExpiry(validityPeriod: number): string {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + validityPeriod);
  return expiryDate.toISOString();
}

// =====================================================
// REFERAL CODE UTILITIES
// =====================================================

/**
 * Generate referral code
 */
export function generateReferralCode(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Validate referral code format
 */
export function isValidReferralCode(code: string): boolean {
  return /^[A-Z0-9]{6,10}$/.test(code);
}

// =====================================================
// PRICING UTILITIES
// =====================================================

/**
 * Calculate GST amount
 */
export function calculateGST(amount: number, gstRate: number = 18): number {
  return Math.round((amount * gstRate) / 100 * 100) / 100;
}

/**
 * Calculate discount amount
 */
export function calculateDiscount(amount: number, discountType: 'percentage' | 'fixed', discountValue: number, maxDiscount?: number): number {
  let discount = 0;
  if (discountType === 'percentage') {
    discount = (amount * discountValue) / 100;
    if (maxDiscount && discount > maxDiscount) {
      discount = maxDiscount;
    }
  } else {
    discount = discountValue;
  }
  return Math.min(discount, amount);
}

/**
 * Calculate shipping charges based on pincode
 */
export function calculateShippingCharges(pincodeService: PincodeService, cartTotal: number, isExpress: boolean = false): number {
  // Free shipping above certain threshold
  const freeShippingThreshold = 500;
  if (cartTotal >= freeShippingThreshold && !isExpress) {
    return 0;
  }
  return isExpress ? pincodeService.expressCharges : pincodeService.deliveryCharges;
}

/**
 * Calculate order total
 */
export function calculateOrderTotal(
  subtotal: number,
  discount: number,
  couponDiscount: number,
  referralDiscount: number,
  shippingCharges: number,
  gstRate: number = 18
): { subtotal: number; discount: number; taxableAmount: number; gstAmount: number; shippingCharges: number; total: number } {
  const totalDiscount = discount + couponDiscount + referralDiscount;
  const taxableAmount = subtotal - totalDiscount;
  const gstAmount = calculateGST(taxableAmount, gstRate);
  const total = taxableAmount + gstAmount + shippingCharges;
  
  return {
    subtotal,
    discount: totalDiscount,
    taxableAmount,
    gstAmount,
    shippingCharges,
    total: Math.round(total * 100) / 100
  };
}

// =====================================================
// DATE UTILITIES
// =====================================================

/**
 * Format date for display
 */
export function formatDate(date: string | Date, format: 'short' | 'long' | 'time' = 'short'): string {
  const d = new Date(date);
  
  if (format === 'time') {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  
  if (format === 'long') {
    return d.toLocaleDateString('en-IN', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  }
  
  return d.toLocaleDateString('en-IN', { 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  });
}

/**
 * Calculate estimated delivery date
 */
export function calculateDeliveryDate(pincodeService: PincodeService, orderDate: Date = new Date()): string {
  const deliveryDate = new Date(orderDate);
  deliveryDate.setDate(deliveryDate.getDate() + pincodeService.deliveryDays);
  return deliveryDate.toISOString();
}

/**
 * Check if date is within validity period
 */
export function isWithinValidity(startDate: string, endDate: string): boolean {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  return now >= start && now <= end;
}

// =====================================================
// STOCK UTILITIES
// =====================================================

/**
 * Check if stock is low
 */
export function isStockLow(currentStock: number, minStockLevel: number): boolean {
  return currentStock <= minStockLevel;
}

/**
 * Check if stock is critical
 */
export function isStockCritical(currentStock: number, reorderLevel: number): boolean {
  return currentStock <= reorderLevel;
}

/**
 * Check if medicine is about to expire
 */
export function isExpiringSoon(expiryDate: string, daysThreshold: number = 90): boolean {
  const expiry = new Date(expiryDate);
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + daysThreshold);
  return expiry <= threshold;
}

/**
 * Check if medicine is expired
 */
export function isExpired(expiryDate: string): boolean {
  return new Date(expiryDate) < new Date();
}

// =====================================================
// COUPON UTILITIES
// =====================================================

/**
 * Validate coupon code
 */
export function validateCoupon(
  coupon: Coupon, 
  cartTotal: number, 
  userUsageCount: number
): { valid: boolean; message: string; discount: number } {
  // Check if coupon is active
  if (!coupon.isActive) {
    return { valid: false, message: 'Coupon is not active', discount: 0 };
  }
  
  // Check validity period
  if (!isWithinValidity(coupon.validFrom, coupon.validUntil)) {
    return { valid: false, message: 'Coupon has expired', discount: 0 };
  }
  
  // Check usage limit
  if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
    return { valid: false, message: 'Coupon usage limit reached', discount: 0 };
  }
  
  // Check minimum order amount
  if (cartTotal < coupon.minOrderAmount) {
    return { valid: false, message: `Minimum order amount is ₹${coupon.minOrderAmount}`, discount: 0 };
  }
  
  // Check per user limit
  if (coupon.perUserLimit && userUsageCount >= coupon.perUserLimit) {
    return { valid: false, message: 'You have already used this coupon', discount: 0 };
  }
  
  // Calculate discount
  const discount = calculateDiscount(cartTotal, coupon.type, coupon.value, coupon.maxDiscount);
  
  return { valid: true, message: 'Coupon applied successfully', discount };
}

// =====================================================
// DRUG INTERACTION UTILITIES
// =====================================================

/**
 * Check for drug interactions (simplified version)
 * In production, use a comprehensive drug interaction database
 */
export function checkDrugInteractions(medicines: Medicine[]): { hasInteraction: boolean; interactions: string[] } {
  const interactions: string[] = [];
  
  // Simplified interaction checks - in production, use a proper database
  const knownInteractions: Record<string, string[]> = {
    'aspirin': ['warfarin', 'heparin', 'methotrexate'],
    'warfarin': ['aspirin', 'ibuprofen', 'vitamin k'],
    'metformin': ['alcohol', 'contrast dye'],
    'amoxicillin': ['contraceptives'],
    'ciprofloxacin': ['tizanidine', 'theophylline'],
  };
  
  const medicineNames = medicines.map(m => m.genericName.toLowerCase());
  
  for (const medicine of medicines) {
    const interactionsList = knownInteractions[medicine.genericName.toLowerCase()];
    if (interactionsList) {
      for (const interaction of interactionsList) {
        if (medicineNames.some(name => name.includes(interaction))) {
          interactions.push(
            `Potential interaction between ${medicine.genericName} and ${interaction}`
          );
        }
      }
    }
  }
  
  return {
    hasInteraction: interactions.length > 0,
    interactions
  };
}

// =====================================================
// AGE VERIFICATION UTILITIES
// =====================================================

/**
 * Calculate age from date of birth
 */
export function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

/**
 * Check if age meets requirement
 */
export function meetsAgeRequirement(dateOfBirth: string, requiredAge: number): boolean {
  return calculateAge(dateOfBirth) >= requiredAge;
}

// =====================================================
// QUANTITY LIMIT UTILITIES
// =====================================================

/**
 * Get maximum quantity allowed for a medicine
 */
export function getMaxQuantity(medicine: Medicine, isScheduled: boolean = false): number {
  if (isScheduled || medicine.isScheduledDrug) {
    // Stricter limits for scheduled drugs
    return Math.min(medicine.stock, medicine.packSize * 3);
  }
  // Regular medicines
  return Math.min(medicine.stock, medicine.packSize * 10);
}

/**
 * Validate quantity against limits
 */
export function validateQuantity(medicine: Medicine, requestedQuantity: number): { valid: boolean; message: string } {
  const maxQuantity = getMaxQuantity(medicine);
  
  if (requestedQuantity <= 0) {
    return { valid: false, message: 'Quantity must be greater than 0' };
  }
  
  if (requestedQuantity > medicine.stock) {
    return { valid: false, message: 'Requested quantity exceeds available stock' };
  }
  
  if (requestedQuantity > maxQuantity) {
    return { valid: false, message: `Maximum quantity allowed is ${maxQuantity}` };
  }
  
  return { valid: true, message: 'Quantity is valid' };
}

// =====================================================
// PAGINATION UTILITIES
// =====================================================

/**
 * Paginate array
 */
export function paginate<T>(items: T[], page: number, pageSize: number): T[] {
  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  return items.slice(startIndex, endIndex);
}

/**
 * Format pagination metadata
 */
export function formatPagination(total: number, page: number, pageSize: number) {
  const totalPages = Math.ceil(total / pageSize);
  return {
    total,
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}

// =====================================================
// STRING UTILITIES
// =====================================================

/**
 * Mask mobile number
 */
export function maskMobile(mobile: string): string {
  return mobile.slice(0, 2) + '******' + mobile.slice(-4);
}

/**
 * Mask email
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const maskedLocal = local.slice(0, 2) + '***' + local.slice(-1);
  return `${maskedLocal}@${domain}`;
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Slugify string
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
