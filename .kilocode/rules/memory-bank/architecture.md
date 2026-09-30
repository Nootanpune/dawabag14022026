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
