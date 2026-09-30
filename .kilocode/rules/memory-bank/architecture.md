# Architecture

- `backend/src/index.ts` mounts routers under `/api/v1/*`.
- `middleware/auth.middleware.ts` loads `role`, `customer_type`, `kyc_status`
  from the DB on every request and sets `req.user.pricing_type`
  (`utils/customerType.ts: effectiveCustomerType`). Never trust customer_type
  from the JWT for pricing or permissions.
- Buyer-type rules (price column, Rx requirement, credit terms, KYC document
  matrix) live only in `utils/customerType.ts`, unit-tested in `customerType.test.ts`.
- All buyers have `users.role = 'customer'`; `customer_type` distinguishes them.
  Staff roles: pharmacist_rx, pharmacist_pack, delivery, admin, super_admin.
- Responses: `{ success, message?, data? }`; errors also carry `error` (legacy) and,
  for validation (422), `errors: [{ path, message }]`. Request bodies are
  redacted before logging.
- KYC files: `services/storage.service.ts` (S3 with AES-256, or local in dev),
  metadata in `kyc_documents`. Consent: append-only `consent_records`.
- Money is integer paise everywhere.
- **Server is the single source of truth.** Cart = `carts`/`cart_items` (product +
  quantity only) behind `/api/v1/cart`; prices computed live by `services/cart.service.ts`.
  Web: refresh token only in the httpOnly `dwb_rt` cookie (`utils/sessionCookie.ts`,
  clients send `X-Client: web`), access token in memory, session restored via
  `POST /auth/refresh`. Mobile: refresh token in the keychain, rotated on every refresh.
- Coupons: `services/coupon.service.ts` is used by both cart and checkout; discounts
  exclude Schedule H/H1 lines (C-21).
- KYC approval: `KYCOrchestrator.checkAndActivate` — all required checks verified,
  all documents present, licence unexpired. Admin API in `controllers/kycAdmin.controller.ts`.
- Scheduled jobs: `jobs/registry.ts` (definitions), `jobs/scheduler.ts` (cron + lock +
  job_runs), one file per job. Admin: `GET /admin/jobs`, `POST /admin/jobs/:name/run`.
- Audit: always through `utils/audit.ts` (`writeAudit` / `writeAuditTx`).
- **Orders (Sprint 3):** `services/orderPlacement.service.ts` places every order (API
  and refill job). `services/allocation.service.ts` picks one seller + batch per line
  (rule in the pure `services/sellerSelection.ts`; thresholds in `app_settings`), then
  `services/shipment.service.ts` creates one `order_shipments` row per seller of record,
  each with its own gap-free invoice number (`next_invoice_number(series, prefix)`:
  'DWB' Dawabag goods, 'DWS' Dawabag services/commission, 'P:<vendor>' partners).
  `orders.invoice_number` is Dawabag's invoice only (NULL if only partners ship).
- **Marketplace:** partners are `vendors` (vendor_type marketplace_partner|both) with
  logins linked through `vendor_users` (role 'partner', guard `middleware/partner.middleware.ts`).
  Partner portal `/api/v1/partner/*`; listings sell at catalogue price; settlements in
  `services/settlement.service.ts` with arithmetic in `services/settlementMath.ts`.
- **Refills:** `services/refill.service.ts` + `services/mandate.service.ts` (Razorpay
  recurring; untested without keys). Payment capture → `services/paymentCapture.service.ts`.
  Razorpay client + webhook signature: `services/razorpay.client.ts` (raw-body HMAC).
- **Settings:** `app_settings` via `services/settings.service.ts`; admin edits keys with
  validation in `controllers/marketplaceAdmin.controller.ts`.
- **Fulfilment (Sprint 4):** `/api/v1/fulfilment/*`. Prescription gate in
  `services/rxGate.service.ts` (`assertRxCleared` before pack/dispatch, `recordH1Dispensing`
  on dispatch into the append-only `h1_register`). Pharmacist decisions in
  `services/rxVerification.service.ts` (role pharmacist_rx + `users.pharmacist_reg_no`;
  quantities in `prescription_items`, lines linked by `order_items.prescription_id`).
  Own shipments: `services/fulfilment.service.ts`; partner shipments:
  `services/partnerFulfilment.service.ts`; order status follows shipments (`syncOrderStatus`).
- **Invoices:** `GET /api/v1/invoices/shipments/:id.pdf` built on demand by
  `services/invoiceData.service.ts` + `services/invoicePdf.ts` (never stored).
- **Prices:** `products_price_le_mrp` and `products_mrp_le_ceiling` CHECKs plus
  `assertPrices` in the product controller (C-16).
- **Compliance modules:** grievances (`services/grievance.service.ts`, `/grievances`),
  public legal details from `legal.*` settings (`/legal/info`), batch recalls
  (`services/recall.service.ts`, `/recalls`; `is_recalled` batches are excluded from every
  stock query and block pack/dispatch), privacy rights (`services/privacy.service.ts`,
  `/privacy`: consents, on-the-fly export, erasure that keeps statutory records).
