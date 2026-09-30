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
