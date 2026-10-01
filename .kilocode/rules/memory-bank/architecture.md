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
- **After-sale (Sprint 5):** `services/cancellation.service.ts` (buyer until packing, staff
  until dispatch; also used by `PATCH /orders/:id/status cancelled`), `services/return.service.ts`
  (`/returns`), `services/creditNote.service.ts` (series `<invoice prefix>-CN`, gap-free via
  `next_invoice_number`), `services/refund.service.ts` (ledger `refunds`: credit_adjustment →
  gateway → wallet → manual; gateway legs sent after commit, pending without Razorpay keys;
  webhook matches `gateway_refund_id`). Partner returns add `settlement_adjustments`, netted in
  the next settlement (lines with status delivered *or* returned are settled). Never restock.
- **Checkout preview:** `placeOrder(..., { preview: true })` runs the real placement and throws
  `OrderPreview` (services/checkoutSummary.service.ts) so the transaction rolls back — no
  reservation, coupon use, wallet/credit change or invoice number is kept.
- **Handover:** `services/handover.service.ts` — seal number at dispatch; delivery code is an
  HMAC of shipment id + dispatched_at (not stored), shown only to the buyer on `GET /orders/:id`.
- **Product page:** `services/productDetail.service.ts` returns only whitelisted fields and the
  caller's own price; description only when `content_status = 'approved'`
  (`services/productContent.service.ts`, flags from `utils/claimsCheck.ts`).
- **Other:** policies `services/policy.service.ts` (`/legal/policies`, versioned), side-effect
  reports and licence register under `/compliance` (job `licence_register_alerts`), addresses in
  `services/address.service.ts` (a used address is retired and copied on edit), signed 5-minute
  document links `utils/signedLink.ts` (`/invoices/.../link`).
- **Operations (Sprint 6):** logs to stdout only (`config/logger.ts`); start-up config checks
  `config/env.ts` (production refuses weak/placeholder secrets and missing keys); `/health` and
  `/ready`; graceful SIGTERM. Migrations: `src/db/migrate.ts` + `schema_migrations` (checksums,
  advisory lock, `--status`, `--baseline NN`); the Docker image runs it before the API. Images:
  `backend/Dockerfile` (build from repo root), `frontend-web/Dockerfile` (standalone). Runbook:
  `docs/RUNBOOK.md`.
- **Final records:** triggers in migration 09 block UPDATE/DELETE on h1_register, credit_notes,
  credit_note_items, audit_logs, consent_records and on invoice amounts/lines
  (order_shipments, order_items). Bypass only with `SET dawabag.maintenance = 'on'` (tests, purges).
- **Money rules:** `refund.service.refundableAmount` (paid − refunded, under the order lock) caps
  every refund; `PATCH /orders/:id/status` is admin cancel only; placement takes the PIN code from
  the buyer's own address, rejects repeated products, caps wallet at the payable, counts coupon
  use atomically (`coupon_redemptions`, `coupons.per_user_limit`).
- **Catalogue import:** `services/catalogueImport/{parse,validate,apply}.ts` (`/catalogue/import/*`),
  exceljs from memory. **Accounts:** `services/gstReports.service.ts` (`/accounts/reports/:name`),
  CSV via `utils/csv.ts` (formula-safe). **Incidents:** `services/incident.service.ts`
  (`/compliance/incidents`). Saved Rx reuse: `services/rxReuse.service.ts`.
- **Purchasing (Sprint 7):** `services/purchasing/` — `supplierCheck` (approved, active, unexpired
  drug licence), `purchaseOrder.service` (PO series, draft → sent → partially_received → received /
  closed / cancelled), `goodsReceipt.service` (GRN series; the only way stock enters after go-live;
  refuses short shelf life, printed MRP below any selling price, over-receipt, recalled batches;
  repeat deliveries of a batch average its cost). Routes `/purchasing/*`. Receipts are final records.
- **Stock control:** `services/stock/` — `adjustment.service` (approver ≠ requester, never below
  reserved; expired/damaged/recalled write-offs form the destruction register), `stockCount.service`
  (snapshot → count → second-person approval → count_variance adjustments), `batches.service`;
  job `expiry_watch`. Routes `/stock/*`. Reports `purchase-register`, `stock-valuation`.
- **Storage/email:** AWS SDK v3 (`@aws-sdk/client-s3`, presigner, `client-ses` via nodemailer).
- **Notifications (Sprint 8):** `notification.service` (Bull queue, `queueNotification`, `sendOTP`)
  → `notifications/dispatcher` (inbox row + every channel attempt logged in
  `notification_deliveries`) → `channels/sms` (MSG91 flow API, DLT template per message type from
  setting `sms.dlt_templates`, variables from `templates.smsVariables`), `channels/email` (SES),
  `channels/push` (FCM HTTP v1, service-account JWT; tokens in `user_devices`, unregistered ones
  removed). Wording in `notifications/templates.ts`.
- **Courier (Sprint 8):** `services/courier/` — `shiprocket.client` (login token in memory, adhoc
  order + AWB assign), `courier.service` (book, webhook updates, buyer tracking), `status` (pure:
  status normalising, IST timestamps). Routes `/fulfilment/shipments/:id/book-courier`,
  `/courier/shiprocket/webhook`. Provider URLs overridable by `*_BASE_URL` for tests only.
- **E-invoicing (Sprint 9, C-31):** `services/einvoice/` — `irp.client` (common NIC API: RSA login,
  AES-256-ECB SEK, token in memory, 1005 → re-login, 2150 duplicate → fetch existing IRN),
  `payload` (pure; built from `invoiceData.loadInvoice/loadCreditNote`, the PDF's own source),
  `einvoice.service` (table `einvoices` per INV/CRN document; created at pack, Bull queue
  `einvoice` + `einvoice_sweep` job; dispatch gate `assertEinvoiceReady`, missing records made in
  their own transaction by `prepareDispatchEinvoice`). Routes `/einvoices` (admin list, retry).
  Setting `einvoice.enabled`. Registered rows are final (trigger `dawabag_einvoice_final`).
- **Document numbers:** `next_invoice_number` returns `<prefix>/<2627>/<00001>` and raises above
  16 characters (CGST Rule 46); credit notes print `<prefix>C`, series key unchanged.
- **Purchase returns (Sprint 9, C-28):** `services/purchasing/purchaseReturn.service` — PRN series,
  approval by a second person applies `return_to_supplier` stock adjustments, dispatch reference,
  supplier credit note settles; report `purchase-returns`. Routes `/purchasing/returns/*`.
