# Dawabag - Pharmaceutical E-Commerce Platform Specification

## Complete Specification Document Addressing All Gaps

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Customer-Features (Addressing Gaps)](#customer-features)
3. [Backend Features (Addressing Gaps)](#backend-features)
4. [Doctor Portal (Addressing Gaps)](#doctor-portal)
5. [Pharmacy Portal (Addressing Gaps)](#pharmacy-portal)
6. [Security & Compliance](#security--compliance)
7. [Technical Requirements](#technical-requirements)

---

## 1. Executive Summary

This document addresses all gaps identified in the original URS for the Dawabag pharmaceutical e-commerce platform. The platform is a comprehensive online pharmacy solution with multiple user roles: Customers, Doctors, Pharmacies, and Admin/Staff.

### Platform Objectives
- Enable customers to search, compare, and purchase medicines online
- Provide prescription verification and management
- Support multiple user roles with role-based access
- Ensure regulatory compliance for pharmaceutical sales
- Deliver a secure, reliable e-commerce experience

---

## 2. Customer Features (Addressing Identified Gaps)

### 2.1 Authentication & Account Management
- [x] Email/password registration with mobile OTP verification
- [x] Facebook OAuth login
- [x] Google OAuth login
- [x] **Forgot Password** - Password reset via email/SMS
- [x] **Password Recovery** - Full recovery flow with secure token
- [x] Account activation via email and mobile verification
- [x] Session management with configurable timeout (default: 30 minutes)
- [x] Concurrent login handling (allow max 3 devices)

### 2.2 Medicine Search & Discovery
- [x] Search by brand name, generic name, salt composition
- [x] **Advanced Filters**: Price range, manufacturer, dosage form, category
- [x] **Medicine Alternatives**: Show substitutes when medicine unavailable
- [x] **Out of Stock Handling**: Notify when back in stock, suggest alternatives
- [x] **Wishlist/Favorites**: Save medicines for later purchase
- [x] Recently viewed medicines
- [x] Category-based browsing
- [x] Popular medicines section

### 2.3 Product Display
- [x] Medicine name, SKU, marketed by
- [x] MRP and offer price display
- [x] Quantity selector
- [x] **Product Image Display** on selection
- [x] Medicine description, composition, usage
- [x] Drug interactions warning
- [x] Side effects information
- [x] Storage instructions

### 2.4 Shopping Cart
- [x] Add to cart functionality
- [x] **Cart Persistence** - Items saved across sessions
- [x] Continue shopping option
- [x] Update quantity
- [x] Remove items
- [x] Apply coupon codes
- [x] Cart summary with total

### 2.5 Checkout Process
- [x] Guest checkout (search without login)
- [x] **Login/Signup** before payment
- [x] Shipping address selection/entry
- [x] Billing address (can be same as shipping)
- [x] **No Cash on Delivery** - As per URS requirement
- [x] **Prescription Upload** - Required before payment
- [x] **Multiple Prescriptions** support per order
- [x] **Prescription Validity** - 30 days for regular, 6 months for chronic
- [x] Payment gateway integration (multiple options)
- [x] Order summary review

### 2.6 Order Management
- [x] **Order Placement** with unique order ID
- [x] **Order Tracking** - Detailed tracking page
- [x] **Order Cancellation** - Within 24 hours before dispatch
- [x] **Order Modification** - Quantity change before packing
- [x] **Order History** - View all past orders
- [x] **Refill Orders** - Mark orders for refill
- [x] **Reminder Emails** - Before refill date
- [x] **Order Status Notifications** - Email/SMS at each step

### 2.7 Prescription Management
- [x] Upload prescriptions (image/PDF)
- [x] View uploaded prescriptions
- [x] Link prescriptions to orders
- [x] **Prescription Expiry Alerts**
- [x] **Multiple Patients** - Add and manage patients
- [x] Separate prescriptions per patient
- [x] Prescription history

### 2.8 Patient Management
- [x] Add multiple patients
- [x] Patient details: Name, age, gender, medical history
- [x] Manage patient prescriptions
- [x] Default patient selection

### 2.9 Discounts & Offers
- [x] Coupon code system
- [x] Referral code system
- [x] **Welcome Offer** for first-time registration
- [x] Festival/special offers
- [x] Loyalty points system
- [x] Doctor referral discounts (URS point 23)
- [x] Pharmacy-specific pricing

### 2.10 Shipping & Delivery
- [x] **Pincode Selection** on homepage for delivery check
- [x] Shipping charges per pincode
- [x] **Tentative Delivery Dates** based on pincode
- [x] Free shipping threshold
- [x] Delivery time slots
- [x] Express delivery option

### 2.11 Notifications
- [x] Email notifications
- [x] SMS notifications
- [x] Order tracking notifications
- [x] Prescription verification status
- [x] Payment confirmation
- [x] Delivery updates
- [x] Refill reminders
- [x] Promotional notifications (opt-in)

### 2.12 Customer Support
- [x] **Help Center/FAQ**
- [x] **Live Chat** support
- [x] **Support Ticket** system
- [x] Call support option
- [x] Email support

### 2.13 Additional Features
- [x] **Product Reviews/Ratings**
- [x] Medicine information articles
- [x] Health tips section
- [x] Language selection (future)
- [x] **Invoice Download** after payment

---

## 3. Backend Features (Addressing Identified Gaps)

### 3.1 Authentication & Authorization
- [x] Multiple login roles: Admin, Super Admin, Pharmacist, Packing Staff, Delivery Staff
- [x] **Role-Based Access Control (RBAC)** with granular permissions
- [x] **Session Management** with timeout
- [x] **Audit Logs** for all admin actions
- [x] **User Activity Tracking** by Super Admin
- [x] Access rights management (grant/deny)

### 3.2 Super Admin Features
- [x] Control and track all login activities
- [x] Manage access rights for all roles
- [x] View all system reports
- [x] System configuration
- [x] Staff management

### 3.3 Inventory Management
- [x] Current stock levels
- [x] Stock placement tracking
- [x] **Auto-generated PO** for depleting inventory
- [x] **Alert System** for low stock (configurable thresholds)
- [x] **Expiry Alert** - 90 days before expiry
- [x] Batch/lot tracking
- [x] **Multi-warehouse Support**
- [x] Stock transfer between warehouses

### 3.4 Vendor Management
- [x] Vendor registration
- [x] Drug license number validation
- [x] GST registration details (regular/unregistered/composition)
- [x] Opening balance tracking (payable/receivable)
- [x] Products supplied by vendor
- [x] Delivery time tracking
- [x] Payment terms management
- [x] KYC document storage

### 3.5 Purchase Order Management
- [x] Generate PO by vendor or product
- [x] Share PO via email/WhatsApp/print
- [x] **Vendor Listing** for restocking with:
  - Payment terms
  - Delivery time
  - GST details
  - Approved supply rate
- [x] **Auto PO Generation** on vendor selection and quantity
- [x] PO status tracking

### 3.6 Inventory Details
- [x] Opening stock entry
- [x] Expiry date tracking
- [x] Vendor details
- [x] Quantity management
- [x] Manufacturing date
- [x] Batch number
- [x] **Price History** tracking
- [x] MRP updates

### 3.7 Financial Management
- [x] Debit notes for returns
- [x] Credit notes for excess
- [x] **GSTR-compliant Invoice Export** (Excel format)
- [x] Base amount and GST segregation
- [x] Payment tracking
- [x] Account reconciliation

### 3.8 Order Processing Workflow
- [x] **Pharmacist Login (Verification)**:
  - Display order ID, patient name, mobile number
  - Verify prescriptions
  - Update status to "Prescription Verified"
- [x] **Pharmacist Login (Packing)**:
  - Display orders with "Prescription Verified" status
  - Packing functionality
  - Label printing
  - Update status to "Order Packed"
  - Add packing details (ice bags, foam, etc.)
- [x] **Delivery Staff Login**:
  - Display "Order Packed" orders
  - Receive parcel
  - Assign courier partner
  - Update "Order Dispatched" status
  - Update delivery time

### 3.9 Courier & Delivery Management
- [x] Courier partner details
- [x] Tracking ID generation
- [x] Tracking link management
- [x] Delivery agency master
- [x] Dispatch status tracking
- [x] Delivery time updates

### 3.10 Notifications
- [x] Customer notifications (packing, shipping, delivery)
- [x] Order tracking updates
- [x] Tracking ID sharing

### 3.11 Reporting
- [x] Sales reports
- [x] Purchase reports
- [x] GSTR 1, 2, 3B, 9 reports
- [x] Stock summary
- [x] Low stock summary
- [x] Stock details report
- [x] Discount report
- [x] Tax report
- [x] Custom date range reports
- [x] Export to PDF/Excel

### 3.12 Marketing Management
- [x] Coupon code generation with validity
- [x] Discount code management
- [x] Customer data retrieval
- [x] Push notifications
- [x] Festival offers
- [x] SMS campaigns
- [x] Email campaigns

### 3.13 Integrations
- [x] Payment gateway integration
- [x] SMS gateway
- [x] Email service
- [x] Facebook integration
- [x] Google integration
- [x] Map/Location integration
- [x] **Google Analytics**
- [x] **Google Search Console (SEO)**

### 3.14 Platform Management
- [x] **Responsive Website** (mobile, tablet, desktop)
- [x] App publishing (Play Store, App Store)
- [x] **SEO-friendly URLs**
- [x] Meta tags management
- [x] Sitemap generation
- [x] **Data Export/Import** (CSV, Excel)
- [x] CMS for content management

### 3.15 Security & Performance
- [x] Data encryption at rest
- [x] Data encryption in transit (SSL/TLS)
- [x] API rate limiting
- [x] **Data Backup/Recovery**
- [x] **Disaster Recovery Plan** (RTO: 4 hours, RPO: 1 hour)
- [x] System health monitoring
- [x] Uptime monitoring

---

## 4. Doctor Portal (Addressing Identified Gaps)

### 4.1 Authentication
- [x] Separate login from customer portal
- [x] **Signup with Validation**:
  - Medical registration ID verification
  - Clinic name
  - Specialty
  - Registration number
  - KYC documents
  - Mobile verification (mandatory)
  - Email verification
- [x] **Admin Approval** - Account activation after verification

### 4.2 Doctor Dashboard
- [x] Total patients
- [x] Referrals generated
- [x] Bonus points earned
- [x] **Revenue/Income Report** from referrals
- [x] Redemption history

### 4.3 Referral System
- [x] Generate unique referral code
- [x] Share via email/WhatsApp
- [x] Track redemptions
- [x] **Bonus Points** on each redemption
- [x] **Email Notifications** for each redemption
- [x) Points redemption within validity period

### 4.4 Patient Management
- [x] View patients who used referral code
- [x] **Access Patient Prescription History** (with consent)
- [x] Add medical notes for patients

### 4.5 Doctor Catalog
- [x] **Separate catalogue** from customer pricing
- [x] Doctor/distributor pricing
- [x] Bulk order option

### 4.6 E-Prescription (Future Phase)
- [ ] Generate digital prescriptions
- [ ] Send prescriptions to patient accounts
- [ ] Prescription templates

### 4.7 Communication
- [ ] Chat with patients
- [ ] Video consultation (future)
- [ ] Availability settings

---

## 5. Pharmacy Portal (Addressing Identified Gaps)

### 5.1 Authentication
- [x] Separate login from customer portal
- [x] **Signup with Validation**:
  - Drug license number (mandatory)
  - Food license number (if applicable)
  - GST number
  - KYC documents
  - Mobile verification
  - Email verification
- [x] **Document Upload** for verification
- [x] **Admin Approval** - Account activation after verification

### 5.2 Pharmacy Dashboard
- [x] Order history
- [x] Account summary
- [x] Credit limit display
- [x] Payment due dates

### 5.3 Pharmacy Catalog
- [x] **Different catalogue** than customer
- [x] Wholesale/B2B pricing
- [x] **Bulk Ordering** functionality

### 5.4 Payment Management
- [x] **Payment Terms**:
  - Default: Prepaid
  - Change to Post-paid upon request
  - Based on purchase volume
- [x] Credit limit management
- [x] **Payment Reminders** for due amounts
- [x] **Invoice Generation**
- [x] **Monthly Account Statement**
- [x] GST billing for pharmacy transactions

### 5.5 Order Management
- [x] Place orders
- [x] Track orders
- [x] Order history
- [x] Reorder functionality

---

## 6. Security & Compliance

### 6.1 Data Security
- [x] AES-256 encryption for sensitive data
- [x] SSL/TLS for data in transit
- [x] Secure password hashing (bcrypt)
- [x] JWT tokens with short expiry
- [x] Input validation and sanitization
- [x] XSS protection
- [x] CSRF protection

### 6.2 Payment Security (PCI-DSS)
- [x] PCI-DSS compliant payment processing
- [x] No card data storage
- [x] Secure payment gateway integration
- [x] 3D Secure for card payments

### 6.3 Pharmaceutical Compliance
- [x] **Prescription Validation**:
  - AI-powered prescription verification
  - Manual pharmacist review
  - Image authenticity check
- [x] **Drug Interaction Check**:
  - System warns of dangerous interactions
  - Block sale of interacting drugs together
- [x] **Age Verification**:
  - Verify age for restricted medicines
  - Block sale to minors for certain categories
- [x] **Narcotic/Schedule Drug Control**:
  - Special handling for Schedule X drugs
  - ID verification for certain drugs
  - Quantity limits as per law
- [x] Drug license validation
- [x] Pharmacy registration verification
- [x] Doctor registration verification

### 6.4 Privacy & Legal
- [x] Privacy Policy
- [x] Terms & Conditions
- [x] Return & Refund Policy
- [x] Cookie Policy
- [x] GDPR compliance for EU users
- [x] Data retention policy

---

## 7. Technical Requirements

### 7.1 Technology Stack
- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **Backend**: Node.js with Next.js API routes
- **Database**: PostgreSQL (recommended for pharmaceutical data)
- **Authentication**: JWT with refresh tokens
- **Payment Gateway**: Stripe, Razorpay, or similar
- **SMS**: Twilio or similar
- **Email**: SendGrid or similar
- **Analytics**: Google Analytics 4

### 7.2 Performance Requirements
- Page load time: < 3 seconds
- API response time: < 500ms
- Uptime: 99.9%
- Support for 10,000+ concurrent users

### 7.3 Mobile App (Future Phase)
- iOS app
- Android app
- React Native or Flutter

---

## 8. Appendix: Gap Coverage URS Point Matrix

| Original | Gap Identified | Addressed In |
|--------------------|----------------|--------------|
| Customer #4 | Facebook/Gmail login | Section 2.1 |
| Customer #4 | Mobile verification | Section 2.1 |
| Customer #7 | No COD | Section 2.5 |
| Customer #8 | Prescription upload | Section 2.5 |
| Customer #13 | Quantity limit | Section 2.3 |
| Customer #20 | Past orders, prescriptions | Section 2.6 |
| Customer #20 | Refill orders, reminders | Section 2.6 |
| Customer #21 | Add patients | Section 2.7 |
| Customer #22 | Referral code | Section 2.9 |
| Customer #24 | Pincode selection | Section 2.10 |
| Backend #1 | Multiple logins | Section 3.1 |
| Backend #2 | Super admin tracking | Section 3.2 |
| Backend #4 | Inventory alerts | Section 3.3 |
| Backend #5 | Vendor details | Section 3.4 |
| Backend #8 | Auto PO | Section 3.5 |
| Backend #14 | Prescription verification | Section 3.8 |
| Backend #23 | Reports | Section 3.11 |
| Doctor #1 | Separate login | Section 4.1 |
| Doctor #4 | Referral code | Section 4.3 |
| Doctor #5 | Bonus points | Section 4.3 |
| Doctor #7 | Different catalog | Section 4.5 |
| Pharmacy #1 | Separate login | Section 5.1 |
| Pharmacy #4 | Different catalog | Section 5.3 |
| Pharmacy #5 | Payment terms change | Section 5.4 |
| NEW | Security & Encryption | Section 6.1 |
| NEW | Payment PCI-DSS | Section 6.2 |
| NEW | Drug Interaction Check | Section 6.3 |
| NEW | Age Verification | Section 6.3 |
| NEW | Scheduled Drug Control | Section 6.3 |
| NEW | Audit Logs | Section 3.1 |
| NEW | Data Backup | Section 3.15 |
| NEW | Customer Support | Section 2.12 |
| NEW | Order Cancellation | Section 2.6 |
| NEW | Return/Refund | Section 6.4 |
| NEW | Forgot Password | Section 2.1 |
| NEW | Product Reviews | Section 2.13 |
| NEW | Wishlist | Section 2.2 |

---

## Document Control
- **Version**: 1.0
- **Date**: 2026-02-14
- **Status**: Complete Specification
- **Author**: Dawabag Development Team
