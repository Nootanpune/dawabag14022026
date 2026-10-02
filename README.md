# Dawabag — Online Pharmacy Platform

Full-stack production codebase for Dawabag, an online pharmacy serving customers in India.
Covers a **Flutter mobile app** (Android + iOS), **Next.js web portal**, and **Node.js + TypeScript backend API** on AWS.

---

## Architecture at a glance

```
dawabag/
├── backend/          Node.js + TypeScript REST API (Express)
├── frontend-web/     Next.js 14 web portal (customer, doctor, admin)
├── mobile/           Flutter app (Android + iOS)
└── docker-compose.yml
```

---

## Quick start (Docker)

```bash
# 1. Clone and enter the project
cd dawabag

# 2. Copy and fill environment variables
cp backend/.env.example backend/.env
cp frontend-web/.env.example frontend-web/.env.local
# Edit backend/.env with your AWS, Razorpay, MSG91, FCM keys

# 3. Start all services
docker-compose up -d

# 4. Verify health
curl http://localhost:4000/health
```

| Service     | URL                    |
|-------------|------------------------|
| Backend API | http://localhost:4000  |
| Web portal  | http://localhost:3000  |
| PostgreSQL  | localhost:5432         |
| Redis       | localhost:6379         |

---

## Backend setup (manual)

```bash
cd backend
npm install
cp .env.example .env   # fill all values

# Create database
createdb dawabag
psql -U dawabag_user -d dawabag -f ../database/01_migration.sql
psql -U dawabag_user -d dawabag -f ../database/02_kyc_migration.sql
psql -U dawabag_user -d dawabag -f ../database/03_compatibility_patch_v2.sql

# Start dev server (hot reload)
npm run dev
```

### Key environment variables

| Variable                  | Description                                      |
|---------------------------|--------------------------------------------------|
| `DB_HOST/PORT/NAME/USER`  | PostgreSQL connection                            |
| `REDIS_URL`               | Redis connection string                          |
| `JWT_ACCESS_SECRET`       | 64-char random string for access tokens          |
| `JWT_REFRESH_SECRET`      | 64-char random string for refresh tokens         |
| `AWS_REGION`              | `ap-south-1` (Mumbai — for DPDP data residency)  |
| `AWS_S3_BUCKET`           | S3 bucket for prescriptions (AES-256 encrypted)  |
| `AWS_SES_FROM_EMAIL`      | Verified SES sender email                        |
| `RAZORPAY_KEY_ID/SECRET`  | Razorpay payment gateway credentials             |
| `MSG91_AUTH_KEY`          | SMS OTP gateway                                  |
| `FCM_SERVER_KEY`          | Firebase push notifications                      |
| `AGORA_APP_ID`            | Video consultation (Agora RTC)                   |
| `SHIPROCKET_EMAIL`        | Shiprocket courier integration                   |

---

## API reference

Base URL: `http://localhost:4000/api/v1`

### Auth
| Method | Endpoint              | Description                    | Auth     |
|--------|-----------------------|--------------------------------|----------|
| POST   | `/auth/register`      | Register new user              | Public   |
| POST   | `/auth/verify-otp`    | Verify mobile OTP              | Public   |
| POST   | `/auth/login`         | Login with mobile + password   | Public   |
| POST   | `/auth/send-otp`      | Send OTP for verification      | Public   |
| POST   | `/auth/refresh`       | Refresh access token           | Public   |
| POST   | `/auth/logout`        | Logout + blacklist token       | Bearer   |

### Products
| Method | Endpoint                  | Description             | Auth       |
|--------|---------------------------|-------------------------|------------|
| GET    | `/products/search`        | Search + filter; optional `sort` = relevance / price_asc / price_desc | Optional |
| GET    | `/products/search/suggest`| "Did you mean" names for a search with no results | Public |
| GET    | `/products/categories`    | All categories          | Optional   |
| GET    | `/products/:id`           | Product detail          | Optional   |
| POST   | `/products`               | Create product          | Admin      |
| PATCH  | `/products/:id`           | Update product          | Admin      |

### Orders
| Method | Endpoint                  | Description             | Auth         |
|--------|---------------------------|-------------------------|--------------|
| POST   | `/orders`                 | Create order            | Customer     |
| GET    | `/orders/my`              | My orders               | Customer     |
| GET    | `/orders/queue`           | Staff order queue       | Staff/Admin  |
| GET    | `/orders/:id`             | Order detail            | Customer     |
| PATCH  | `/orders/:id/status`      | Update order status     | Staff/Admin  |

### Cart
| Method | Endpoint                  | Description             | Auth       |
|--------|---------------------------|-------------------------|------------|
| GET    | `/cart`                   | The server cart         | Bearer     |
| PUT    | `/cart/items/:productId`  | Set quantity (0 removes)| Bearer     |
| PUT    | `/cart/coupon`            | Apply / remove coupon   | Bearer     |
| GET    | `/cart/buy-again`         | Delivered medicines not in the cart | Bearer |
| GET    | `/cart/cheaper-options`   | Same medicine, lower price, per line (suggestion only) | Bearer |

### Payments
| Method | Endpoint                  | Description             | Auth       |
|--------|---------------------------|-------------------------|------------|
| POST   | `/payments/create-order`  | Init Razorpay order     | Customer   |
| POST   | `/payments/verify`        | Verify payment          | Customer   |
| POST   | `/payments/webhook`       | Razorpay webhook        | Public     |
| POST   | `/payments/refund`        | Initiate refund         | Admin      |

### Prescriptions
| Method | Endpoint                      | Description                 | Auth            |
|--------|-------------------------------|-----------------------------|-----------------|
| POST   | `/prescriptions/upload`       | Upload prescription (S3); `order_id` optional | Customer |
| POST   | `/prescriptions/:id/use-for-order` | Offer a verified, or uploaded and unchecked, prescription for an order | Customer |
| GET    | `/prescriptions/my`           | My prescriptions            | Customer        |
| GET    | `/prescriptions/queue`        | Pending Rx queue            | Pharmacist Rx   |
| GET    | `/prescriptions/:id/url`      | Signed S3 URL               | Owner/Staff     |
| PATCH  | `/prescriptions/:id/verify`   | Verify or reject Rx         | Pharmacist Rx   |

### Full API covers also:
- `/users/me` — profile, patients, addresses, wallet, notifications
- `/doctors` — list, slots, profile setup, verification
- `/consultations` — book, join (Agora), end, issue digital prescription
- `/coupons` — validate, list, create (admin)
- `/inventory` — batches, low stock, near-expiry
- `/vendors` — CRUD, purchase orders
- `/admin` — stats, user management
- `/reports` — GST (GSTR-1/3B/9), sales, stock, refills due

---

## Frontend web setup

```bash
cd frontend-web
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:4000
# Set NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_...

npm run dev    # http://localhost:3000
npm run build  # production build
```

### Pages built
| Route                   | Description                          |
|-------------------------|--------------------------------------|
| `/`                     | Home — search, categories, products  |
| `/auth/login`           | Login with OTP flow                  |
| `/auth/register`        | Registration                         |
| `/search`               | Results: `?q=&category=&sort=`, load more, "did you mean" |
| `/prescriptions`        | Upload a prescription any time; list with status |
| `/cart`                 | Cart: coupon, add more, buy again, cheaper option |
| `/checkout`             | 3-step: address → Rx → payment       |
| `/orders`               | Order history                        |
| `/orders/[orderId]`     | Order detail + timeline              |
| `/admin`                | Admin dashboard (stats + queue)      |

---

## Flutter mobile setup

```bash
cd mobile
flutter pub get

# Android (emulator or device)
flutter run

# iOS (requires Xcode + Apple Developer account)
cd ios && pod install && cd ..
flutter run

# Release build
flutter build apk --release          # Android APK
flutter build appbundle --release    # Android AAB (Play Store)
flutter build ipa --release          # iOS IPA (App Store)
```

### Configure API URL
In `lib/services/api_service.dart`, the base URL is set via Dart env:
```bash
flutter run --dart-define=API_URL=https://api.dawabag.in
```
For local dev on Android emulator, the default `http://10.0.2.2:4000` maps to your machine's localhost.

### Screens built
| Screen                 | Description                               |
|------------------------|-------------------------------------------|
| `HomeScreen`           | Product search, categories, add to cart   |
| `LoginScreen`          | Mobile + password login                   |
| `RegisterScreen`       | Full registration form                    |
| `OTPScreen`            | 6-digit OTP entry with auto-advance       |
| `CartScreen`           | Cart items, qty controls, coupon, summary |
| `CheckoutScreen`       | 3-step checkout with Razorpay             |
| `OrdersScreen`         | Order history with status badges          |
| `OrderDetailScreen`    | Order timeline + items + bill             |
| `AccountScreen`        | Profile, wallet, menu                     |
| `ProductDetailScreen`  | Full product info + add to cart           |

---

## Database

22 tables covering: users, patient profiles, addresses, wallet, products, inventory batches (FEFO), vendors, purchase orders, coupons, orders, order items, prescriptions, payments, refill subscriptions, doctor profiles, slots, consultations, digital prescriptions, pharmacy profiles, notifications, audit logs, pin code serviceability.

Run the migrations in order (01 → 02 → 03):
```bash
for f in database/0*.sql; do psql -U dawabag_user -d dawabag -f "$f"; done
```

---

## AWS infrastructure (production)

Recommended setup on `ap-south-1` (Mumbai) for DPDP Act data residency:

```
ECS Fargate (backend containers)
  └── RDS PostgreSQL (Multi-AZ)
  └── ElastiCache Redis
  └── S3 (prescriptions, AES-256 encrypted)
  └── SES (transactional email)
  └── CloudFront (static assets + web)
  └── Secrets Manager (all credentials)
  └── CloudWatch (logs + alarms)
```

---

## Role-based access

| Role              | Access                                                      |
|-------------------|-------------------------------------------------------------|
| `customer`        | Browse, order, upload Rx, view own orders                   |
| `doctor`          | Doctor portal, consultations, digital prescriptions         |
| `pharmacy`        | Distributor catalogue + post-paid ordering                  |
| `pharmacist_rx`   | Rx verification queue only                                  |
| `pharmacist_pack` | Packing queue (post-Rx-verified orders only)                |
| `delivery`        | Dispatching (packed orders only)                            |
| `admin`           | Full order management, products, inventory, reports         |
| `super_admin`     | Everything including user role management and audit logs    |

---

## Regulatory compliance built in

- **Schedule H/H1** — mandatory prescription upload enforced at order creation
- **NDPS/Schedule X** — hard block at product and API level
- **Telemedicine Guidelines 2020** — H1/NDPS drugs blocked for teleconsult Rx
- **DPDP Act 2023** — health data in S3 AES-256, consent flow, data deletion support
- **FEFO inventory** — earliest-expiry batch always picked first
- **Cold chain** — tagged products routed to cold-capable couriers only
- **GST** — CGST+SGST (intra-state) / IGST (inter-state) auto-split, GSTR-1/3B/9 exports

---

## License

Proprietary — © 2025 Dawabag. All rights reserved.
