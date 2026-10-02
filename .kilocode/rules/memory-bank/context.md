# Active Context

## Current state (2026-10-02)
The February Kilo Next.js prototype was replaced by the Dawabag v2 package
(built in a Claude chat, 30 Mar 2026). Sprints 1–20 are done (Sprint 14 video calls wired on web and mobile) on branch
`claude/dawabag-pharmacy-status-0h7mr3`; beta now waits mainly on owner data, keys and
the lawyer/CA sign-off.

## Standing rules from the owner (2026-09-30)
- Server is the single source of truth: no local storage anywhere (see DECISIONS.md).
- Modular software: no monolithic HTML/single-file apps.

## Sprint 28 — admin onboards partners (2026-10-02, uncommitted)
Owner wants Nootan Pharmaceuticals, Pune as the first real partner on trial.dawabag.com, but
partner self-registration needs an SMS OTP (no SMS on the trial). So the admin adds partners.
- DB `23_sprint28_partner_onboarding.sql`: `vendor_licences` (vendor_id, licence_type
  dl20/dl21/dl20b/dl21b, number, valid_upto; UNIQUE (vendor, type) and (type, number);
  last_alert_days for a future alert job), `vendor_pharmacists` (name + State Pharmacy
  Council reg. no., is_active; removed ones kept inactive), vendors.trade_name /
  address_line2 / created_by, users.must_change_password / password_changed_at.
  `business_licences` (Sprint 5) stays Dawabag's OWN register — partner licences are separate.
- vendors.drug_license_no/_type/_expiry stay the summary every seller check reads
  (assertPartnerCanSell, allocation, partnerStock): Form 20 first (else 21, 20B, 21B) and
  the EARLIEST valid-till, so any lapsed licence stops selling until renewed (C-33).
  Partner invoices now print all its licence numbers (invoiceData, " / ").
- `utils/gstin.ts` (format, real state code, mod-36 check character; GSTIN state must match
  the address state via gstStateCodes), `utils/passwordPolicy.ts` (8+, letter + digit, ≤ 72
  bytes, not the mobile). `services/partnerOnboarding/{rules,logins,partnerAdmin.service}.ts`.
- API (admin, super_admin): GET/POST `/admin/partners`, GET/PUT `/admin/partners/:id`, POST
  `/admin/partners/:id/logins` (existing `/:id/users` link + `/:id/commission` unchanged).
  Create = one transaction: vendor marketplace_partner approved + kyc approved, licences,
  pharmacists, logins (new user role partner, mobile_verified, must_change_password, temp
  password by admin) — a mobile of a customer/staff account is refused (409, roles never
  changed); an unlinked partner login is linked keeping its password. Refusals: bad/expired
  licence, GSTIN invalid or wrong state, duplicate prefix/GSTIN/licence number. Prefix cannot
  change after invoices. Lat/long from pincode_serviceability when not given. Audit
  partner_created / partner_updated / partner_login_created|linked / password_changed (no
  passwords; errorHandler redacts temporary_password, logins, current/new_password).
- Auth: login + refresh return must_change_password; `auth.middleware` refuses every route
  except /auth/change-password and /auth/logout with 403 code PASSWORD_CHANGE_REQUIRED
  (AppError has optional `code`; optionalAuth treats such logins as anonymous). POST
  `/auth/change-password` (controllers/password.controller.ts): current + new, clears flag,
  revokes old access/refresh tokens, issues a new session.
- Web: Admin menu "Partners" → `/admin/partners` (list), `/new` (sections Business, GST
  with live checksum hint, Drug licences 20/21/20B/21B rows with valid-till, Pharmacists
  repeatable, Address, Logins repeatable with browser-generated temp password + copy; after
  save the passwords are shown once from memory), `/[id]` (may sell to, licences status,
  logins + Add login dialog, edit form). `components/admin/partners/*`,
  `lib/admin/{partnerOnboarding,gstin}.ts`, `lib/auth/password.ts`. Forced change:
  `components/auth/PasswordChangeGate` (in providers) + `/auth/change-password`; the api
  interceptor flags the store on PASSWORD_CHANGE_REQUIRED. Vendors page links "Add partner".
- Retail vs wholesale: NOT distinguished for partners anywhere in allocation / partner stock
  (buyer type never filters partner sellers). Only shown: GET detail `selling_rights`
  {retail: 20/21 in date, wholesale: 20B/21B in date}. Enforcing it needs buyer type in
  allocation.partnerCandidates and partnerStockSql — not built.
- Tests: jest gstin.test + partnerOnboarding/rules.test (42); `test/sprint28.smoke.mjs`
  (54 checks, in test:smoke); e2e `partnerOnboarding.spec.ts` (desktop + phone).
- Not built: partner licence expiry alerts (column ready), privacy-notice consent for
  admin-created logins, mobile app change-password screen (app gets 403 code), partner
  pharmacists offered as H1 pharmacist picker.

## Sprint 27 — partner stock import (2026-10-02, uncommitted)
First partner: Nootan Pharmaceuticals, Pune (20/21 + 20B/21B), billing software MediVision
Platinum (Allied Softtech). The owner's real export ("Stock Report Of Batch-wise Products",
sheet "Report": 8 title rows, headings Product name | Unit | Com | Shelf | Tax% | StkIn dt |
Batch no | ExpDt | Purc rate | PTR | MRP | Sale rate 1 (text) | Qty | Value; name only on a
product's first batch row; "Totals:" after each product; "Generated at … MediVision Platinum"
footer) was read for format only — never committed. Format-agnostic import:
- DB `22_sprint27_partner_stock_import.sql`: `partner_stock_imports` (draft/applied/cancelled,
  headers, mapping, summary, result, sha256), `partner_stock_import_rows` (raw cells + parsed,
  status matched/needs_review/problem/skipped, problems/warnings/candidates),
  `partner_import_mappings` (one per partner, by heading name), `partner_item_links`
  (item_key → product; manual/auto/admin), `partner_product_requests` (open/linked/rejected).
- `services/partnerStockImport/`: readFile (exceljs in memory; CSV/TSV; HTML-as-.xls; binary
  .xls refused with "Save As .xlsx/CSV"; merged banner counted once; heading row = row naming
  most fields), fields (synonyms, `suggestMapping`, MediVision preset by headings or footer),
  rows (fill-down, totals/footer skipped, "10+2" qty, text rupees), values (expiry: Excel
  date/serial, DD/MM/YYYY, MM/YY → month end, MMM-YY), normalise + match (item link → listing
  SKU → catalogue: same name words AND strengths, pack not different, company code not
  different, exactly one product — else needs review with suggestions), validate (missing
  batch/expiry/qty/MRP, expired or ≤ 30 days C-27, sale/PTR > MRP C-16, MRP below Dawabag's
  selling price C-16, Schedule X/NDPS C-10, recall/alert C-28, same batch twice: added if
  same expiry month else problem), evaluate (server-side check stored on rows), import.service
  (upload, mapping save, link/unlink, bulk new-product requests, cancel, admin resolve),
  apply.service (one transaction; reuses `partnerListing.upsertInventoryTx` + `insertListingTx`).
- Apply: per product with a matched line — listing created if missing (catalogue price
  accepted; H1 details; partner GST/licence check) and pending Dawabag review; each batch =
  qty + free, never below reserved; the partner's other batches of that product NOT in the file
  → qty = reserved (0); batches in the file on a problem line untouched; products not in the
  file untouched; refrigerated items need "stored at 2–8 °C" (C-25); exact matches saved as
  auto links; one audit entry (C-46); applying twice 409; drafts older than 24 h refused;
  nothing applied → 400 and rollback. Item key without item code = name|unit|company.
- API `/partner/stock-imports` (POST multipart, GET list/one/rows, PUT mapping, POST recheck,
  PATCH rows/:rowId {product_id|null}, POST request-new-products, apply, cancel); admin
  `/admin/partner-stock-imports[/:id[/rows]]`, `/admin/partner-product-requests[/:id/resolve]`.
- Web: partner nav "Upload stock" → `/partner/stock-import` (drag & drop, history) and
  `/partner/stock-import/[id]` (steps: columns → check lines (Matched / Needs review /
  Problems / Ignored, link dialog, request new) → Apply dialog → result);
  `components/partner/stockImport/*`, `lib/partner/stockImport.ts`. Admin "Partner stock
  files" (`/admin/partner-stock`: requests to link/close, uploads list).
- Fixtures: `backend/test/fixtures/partnerStockFile.mjs` (synthetic MediVision workbook + CSV
  builders) and generated `partner-stock-sample-medivision.xlsx` / `partner-stock-sample.csv`
  (demo partner items). Owner guide `deploy/trial/PARTNER_STOCK_IMPORT.md`.
- Tests: jest 5 suites (60 tests) in `services/partnerStockImport/`; `test/sprint27.smoke.mjs`
  (in test:smoke); e2e `partnerStock.spec.ts` (desktop + phone).
- Not built yet: partner API key / scheduled file drop, "full stock" flag (zero products
  missing from the file), mobile app screens, old binary .xls reading.

## Sprint 26 — customer journey fixes (2026-10-02, uncommitted)
Owner walked the live trial after Sprint 25 (tests green, experience poor): search "not
working", no quantity choice, no back button, prescription unclear at payment, "Pay
securely" showed an error. Walked it like a customer with `e2e/walkthrough/` (phone 390×844
+ laptop, numbered screenshots + notes.json; trial-like stack: APP_ENV=trial, demo seed, no
Razorpay keys, fake object store). Causes and fixes:
- **Search:** the home box only filtered a product list far below the hero (phone: nothing
  visible); the header search was hidden on home. Home now uses the same `SearchCombobox`
  (suggestions with Add, Enter → /search, scrolls to the top on phones); the header search
  appears on home once the hero box scrolls away (`hooks/useInView`). Suggestions stack
  name/generic/price so − qty + fits; dropdown ≥ 30rem on laptops. Toasts moved to the
  bottom (they covered the header and the suggestions).
- **Quantity:** `hooks/useCartQuantity` + `components/cart/{QuantityStepper,CartQuantityControl}`
  (`lib/shop/quantity.ts` limits from the cart line or search/product data): Add → − qty +
  on cards, suggestions, cart lines (limit message in words); product page `ProductBuyBox`
  (choose quantity, "Add 3 to cart · ₹84", then stepper + Go to cart). API: product detail
  returns `min_order_qty` / `max_order_qty` for the buyer type (`qtyLimits` exported).
- **Back:** `components/layout/BackButton` in the header on every page but home
  (`lib/layout/navHistory` in-memory page stack → router.back, else `backTarget.parentPath`);
  checkout steps have Back; breadcrumbs (laptop) on product and search pages.
- **Prescription clarity:** checkout order is now address → prescription → review → place →
  payment. `PrescriptionStep` lists the Rx lines, the buyer's prescriptions as radio cards
  (thumbnail via signed link, uploaded date+time, status, "Chosen"), "Or upload a new one"
  (upload without order, auto-chosen); the choice is offered to the order right after placing
  (`use-for-order`; failure → 'rx-fix' step). Review, payment and confirmation show
  "Prescription (photo) uploaded … ✓ — our pharmacist checks it before dispatch" and
  `RxPolicyNote` (existing policy: told why, send a new one, or cancel for a full refund,
  C-08/C-37). OrderTimeline's rx_rejected text was wrong ("cancelled and refund initiated")
  — fixed to the real behaviour.
- **Payment:** cause = no Razorpay keys on the trial → 503 "Online payments are not
  configured" shown raw. New `GET /payments/options` (`services/payments/paymentMode.ts`:
  razorpay | demo | unavailable). Demo = APP_ENV=trial and no keys (DEMO_PAYMENTS=false
  turns it off; config/env.ts refuses DEMO_PAYMENTS outside trial; routes 404 elsewhere):
  `POST /payments/demo` and `/consultations/:id/pay/demo` (`demoPayment.service.ts`) insert a
  payments row gateway='demo' (demo_order_/demo_pay_ ids) and call the same `applyCapture`
  as Razorpay; failure uses the webhook's `paymentFailed`; audit demo_payment_* {demo:true};
  demo refunds settle at once (`refund.service.settleDemoRefunds`, consultation fee too);
  sweep skips demo rows. Web `PaymentStep`: Razorpay → `lib/payments/razorpayCheckout`
  (shared with consultations; success/failed/dismissed in plain words), demo →
  `DemoPaymentPanel` (tiles UPI/Card/Netbanking/Wallet — no COD exists, Pay (demo),
  Simulate failure), else `PaymentUnavailable`. getApiErrorMessage: 500/502/504 and network
  errors are plain sentences (app `apiErrorMessage` too).
- **App:** `QuantityStepper` / `CartQuantityControl` on grid cards and search results;
  `ProductBuyBar` (quantity before Add); checkout payment step reads /payments/options (demo
  tiles + Simulate failure, "not available" text), shows the prescription label and policy;
  prescription step lists Rx items, date+time, "Chosen"; consultation fee demo via
  `showDemoPaymentSheet`; Razorpay failure/cancel messages plain. Not done on the app: home
  search dropdown (home still opens the Search tab), app checkout keeps prescription after
  review (order placed first), no breadcrumbs (AppBar back already on pushed screens).
- Tests: jest `paymentMode.test.ts` + env DEMO_PAYMENTS (135 jest); `test/sprint26.smoke.mjs`
  (spawns trial APIs on 4126/4128 and refused configs on 4127; in test:smoke); e2e
  `journey.spec.ts` (9: home dropdown + stepper, card/cart stepper, product quantity, Back,
  breadcrumbs, demo success/failure, unavailable, Razorpay opened with the order + dismiss,
  prescription named on review/payment) → 63 e2e; checkout/public/shop specs updated; Flutter
  `sprint26_journey_test.dart` (79). Journeys recorder flow updated (not re-recorded).

- **Demo checkout like Razorpay (Sprint 26 follow-up, owner: "UPI click shows Order placed
  and paid at once"):** choosing a tile now opens that method's own step; only the last screen
  calls the demo endpoint. Web `components/payments/DemoPaymentPanel` (state machine) +
  `payments/demo/*` (DemoBanner on every step, StepHeading focus, BackLink "Change method" /
  "Go back", Escape steps back then closes the dialog; UpiStep: UPI ID demo@upi validated
  name@handle or "Scan QR" = DemoQr drawing marked DEMO that encodes nothing → "Approve the
  payment in your UPI app" 2:00 countdown, Approve/Decline (demo); CardStep: read-only test
  card 4111…1111/12/yy/123/Demo Customer, never sent → Bank OTP 123456, Submit / Fail (demo);
  ProviderStep netbanking SBI/HDFC/ICICI/Axis/Kotak → "<Bank> (demo) bank page" Success/Failure;
  wallet Paytm/PhonePe/Amazon Pay/Mobikwik → Approve/Decline (demo)); decline → "Payment didn't
  go through. No money was taken. You can try again." + Try again → step 1. Old "Simulate
  failure"/"Pay (demo)" removed. `lib/payments/demoCheckout.ts` (paidByLabel); confirmation
  "Paid by: UPI (demo) / Card ending 1111 (demo) / HDFC netbanking (demo) / PhonePe (demo)".
  Same in the consultation dialog. API: options carries `providers` in demo mode
  (`DEMO_PROVIDERS`), demo body takes optional `provider` (`demoProviderValid`: listed bank/
  wallet only, none for upi/card → 422), kept only in the demo audit entry. App: same steps in
  `widgets/payments/demo_checkout/` (DemoCheckout used inline in checkout — bottom Pay bar
  hidden — and in `showDemoPaymentSheet(amountPaise, onPay)`; PopScope back steps back).
  Tests: jest 136, sprint26 smoke + provider checks, e2e journey 14 (68 total), Flutter
  `sprint27_demo_checkout_test.dart` (87 total). Phone walkthrough re-run (payment shots 26–37).

## Sprint 25 — shop like Amazon (2026-10-02, uncommitted)
Owner's trial feedback: search not working, prescription upload not reachable, no way
to add items from the cart.
- **Cause of "search not working" on the trial:** data, not code. The demo catalogue
  has generic names only (no brands, by design) but the web/app hints said "Try Dolo
  650"; `dolo` correctly returns 0. Demo seed checked locally: all 42 products active
  and searchable (paracetamol/para/paracitamol/cetrizine/amlo all hit). Hints now use
  generic examples (`SEARCH_EXAMPLES` web, `SearchEntry.hint` app). No brands added.
- API: `GET /products/search` optional `sort` (relevance default | price_asc |
  price_desc, by the buyer's own price; shape unchanged); `GET /products/search/suggest
  ?q=` "did you mean" (`services/search/didYouMean.ts`: pg_trgm similarity ≥ 0.35 on
  generic names and the brand word, sellable only, C-10; "dolo" no longer suggests
  domperidone); `GET /cart/buy-again` (delivered orders, not in cart, active, not X/NDPS)
  and `GET /cart/cheaper-options` (`services/shopping/`: `sameMedicine.ts` matches
  generic + every strength number + form + release type + schedule + pack; in stock,
  cheaper; suggestion only). `/prescriptions/my` adds file_type, rejection_reason,
  order_number. `rxReuse`: a pending upload with no order can be offered for an order
  (attached exactly like an upload at checkout; pharmacist checks it, C-08); one already
  with an order → 409.
- Web: header search on every shopping page (`components/search/` SearchCombobox =
  ARIA combobox/listbox, 250 ms debounce, 6 suggestions, quick Add; hidden on `/`,
  checkout, auth, portals and for staff roles); `/search?q=&category=&sort=` (URL is the
  state, chips, sort, "Show more", NoResults with did-you-mean + popular + upload link);
  BottomNav Search → /search. `/prescriptions` (upload photo/PDF, camera on phones, list
  with status, signed view link, "now add the medicines"); login `?next=` (safe paths
  only) and RequireAuth returns there. Cart: "Add more medicines", Buy again row,
  cheaper option per line ("Switch to this", only on tap), Rx notice says whether an
  uploaded prescription is ready, richer empty cart. Checkout lists unchecked uploads.
- App: Search tab sort chips, "did you mean" + upload link, price now
  display_price_paise (was offer price for trade buyers); `/account/prescriptions`
  screen (image_picker / file_picker, already deps); home CTA → it (old steps sheet
  removed); cart "Add more medicines" sheet + Rx notice with upload. Buy again / cheaper
  option not on the app yet.
- Tests: jest `sameMedicine.test.ts`, `sortAndSuggest.test.ts`; `test/sprint25.smoke.mjs`
  (in test:smoke); e2e `shop.spec.ts` + search tests in public/a11y (54 e2e). e2e now runs
  the fake object store when S3_ENDPOINT is set (global-setup; CI browser job sets it).
  Flutter `sprint25_shop_test.dart`.

## Sprint 23 — search and free-delivery banner (2026-10-01, uncommitted)
- Search (GET /products/search, response shape unchanged) forgives typos and finds
  brands by generic name: `services/search/` — `searchText.ts` (normalise: lower case,
  punctuation → space, ≤ 6 words; "required" words = ≥ 3 chars with a letter, strengths
  like "650" only rank), `productSearchSql.ts` (each required word a substring of name or
  generic, OR the old full-text match; typo pass adds `word <% column`), `productSearch.
  service.ts` (pass 1 substring/full text; pass 2 trigram only when pass 1 finds nothing;
  read-only transaction with seqscan/parallel off; ranks: name = / starts with query →
  sum of per-word fit (substring 1, generic 0.9, else similarity) → in stock → name;
  stock for matches only, prices/photo for the page only; window count; named statements).
  C-10 Schedule X/NDPS still excluded. Controller only parses the request.
- Migration 21: `pg_trgm` (warns instead of failing without permission; API checks
  `pg_extension` every 5 min and falls back to substring search) + GIN trigram indexes on
  lower(name), lower(generic_name) with fastupdate = off. Threshold
  `pg_trgm.word_similarity_threshold = 0.5` set per connection in config/database.ts.
- Load test (RUNBOOK 7d): equal-work search unchanged or faster; "para" 880 → 703 req/s
  but now returns 50 results instead of none; category browse 724 → 1,021 req/s.
- Free delivery: public `GET /api/v1/delivery/offer` → `{ free_delivery_above_paise }`
  (null = off, Cache-Control no-store; routes/delivery.routes.ts). Web
  `FreeDeliveryNote` under the home search (lib/shop/deliveryOffer.ts, gcTime 0); mobile
  `widgets/home/free_delivery_note.dart` + `freeDeliveryAboveProvider` (autoDispose).
  Shown only when the server returns a number.
- Tests: `test/sprint23.smoke.mjs` (in `test:smoke`), jest `searchText.test.ts`, Flutter
  `free_delivery_note_test.dart`, e2e typo search + free-delivery line (39 e2e now).
- Seen while testing: an unhandled rejection in the notification dispatcher (FK
  `notification_deliveries_notification_id_fkey` when notifications are deleted under
  it) crashes the API process — not fixed here.

## Sprint 24 — trial server (2026-10-01, merged to main via PR #1)
- **Trial moved to https://trial.dawabag.com (2026-10-02, deploy run 36966803021):**
  dawabag.com DNS moved from dead Comodo DNS (ns*.nudns.com) to BigRock (dns1-4.bigrock.in);
  A records trial/api.trial/files.trial → 64.227.172.8; Vercel apex record removed by owner.
  Deploys run from the branch via workflow_dispatch (ref = this branch); Sprint 26 live.
- **Trial LIVE (2026-10-02):** first deploy run 36955107074 green (deploy + APK, demo
  seed, backup, all checks); secrets rotated and 4 GitHub secrets added. Razorpay test keys
  still to add (TRIAL_ENV) — checkout stops at payment until then.
- **Trial status (2026-10-01 evening):** server = the retired PharmaNetra legacy droplet
  64.227.172.8 (owner's choice; Ubuntu 22.04, resized to 4 GB, snapshot taken first).
  Old nginx (pharmanetra.pharmanetra.in, portal.dawabag.com certs) disabled; the old
  PharmaNetra node app (127.0.0.1:3000) and PostgreSQL 14 left running untouched.
  bootstrap-server.sh ran OK. Its output was pasted into chat, so the owner will clear
  /home/dawabag/.ssh/authorized_keys and re-run with --new-deploy-key before adding the
  4 GitHub secrets (none added yet), then Run workflow with seed demo. Trial URL
  https://64-227-172-8.sslip.io. Razorpay test keys not yet provided. Owner has
  dawabag.com (could use trial.dawabag.com later).
- Owner's live trial on one small server (DigitalOcean BLR1, Ubuntu 24.04, 4 GB), deployed
  by GitHub Actions; owner guide `deploy/trial/TRIAL.md` (7 steps; RUNBOOK 7e).
- `deploy/trial/bootstrap-server.sh` (root, idempotent; `curl … | bash -s -- --email …`):
  Docker apt repo + compose plugin, ufw 22/80/443, unattended-upgrades, 2 GB swap if
  < 6 GB, `dawabag` user (docker group), sshd `00-dawabag-trial.conf` (no passwords);
  prints TRIAL_SSH_HOST / _KNOWN_HOSTS / a fresh deploy key (printed once, not kept) and
  TRIAL_ENV via `make-trial-env.sh <ip|domain> <email>` from `trial.env.example`
  (sslip.io names `<ip-dashed>.sslip.io`, api., files.; random secrets; demo password
  `Dwb-xxxx-xxxx-xxxx`). `deploy/trial/trial.sh up|ready|seed|unseed|backup-once|check|
  status|logs|reset|down` runs on the server (reset keeps Caddy certs).
- `.github/workflows/deploy-trial.yml`: workflow_dispatch (seed_demo, reset_data,
  build_apk) + push to the trial branch only if vars.TRIAL_AUTODEPLOY == 'true';
  secrets via env only, key in RUNNER_TEMP removed always, concurrency deploy-trial,
  rsync (protects staging.env), check.sh on server and from outside; `android` job builds
  a debug APK with API_URL=https://<API_DOMAIN> (app adds /api/v1) → `dawabag-trial-apk`.
  actionlint 1.7.7 clean.
- Compose profile `objectstore`: `alpine/minio:RELEASE.2025-10-15T17-29-55Z` (MinIO's own
  images were withdrawn Oct 2025; override OBJECTSTORE_IMAGE), volume at /home/minio,
  SSE-S3 via MINIO_KMS_SECRET_KEY=dawabag-trial-key:$OBJECTSTORE_KMS_KEY, region
  ap-south-1; `objectstore-init` (backup image, `s3.mjs ensure-bucket`: create + encrypted
  write check). Caddy `{$FILES_DOMAIN}` site: GET/HEAD only, X-Amz-Signature required,
  signatures cut from access log, noindex (default `http://files.localhost` when unused).
  Verified locally with the MinIO binary from that image + Caddy 2.10.2: signed link via
  the public host 200 (SSE AES256), tampered/unsigned 403, PUT 405; backups dump/latest OK.
- API: `APP_ENV` (development|test|staging|trial|production) in config/env.ts:
  production refuses ALLOW_MISSING_INTEGRATIONS, S3_ENDPOINT, DEMO_SEED, TRIAL_DEMO_PASSWORD;
  trial needs ALLOW_MISSING_INTEGRATIONS=true and no rzp_live_ key; DEMO_SEED /
  TRIAL_DEMO_PASSWORD refused outside trial (in production). `S3_PUBLIC_ENDPOINT` (https,
  only with S3_ENDPOINT): storage.service signs GET links with a separate client for that
  host (`linkEndpoint`). `/legal/info` returns `trial: true` → web `TrialBanner` (layout)
  "Trial / demo site" strip (C-04).
- Demo seed `backend/src/scripts/demoSeed.ts` + `scripts/demo/*` (guard, catalogueData,
  catalogue, packShot (zlib-only PNG "DEMO PACK" cartons), places, people, practice,
  remove): refuses unless APP_ENV=trial && DEMO_SEED=true (+ strong TRIAL_DEMO_PASSWORD).
  8 Nashik PINs (₹49, 24 h), premises, legal settings "DEMO — not a real licence";
  42 generic medicines (DEMO-*, 8 categories, 1 H1 Cefixime, none X/NDPS, mostly 5% GST),
  2 batches each 12–24 months, copy claims-checked and approved by the demo pharmacist
  via reviewContent (C-19), pack shots via setProductImage when a store exists;
  logins 9000090001–08 (customer, B2B retailer KYC approved, pharmacist_rx DEMO-MSPC-0001,
  pharmacist_pack, delivery, super_admin, doctor via enableDoctor/saveProfile/decideDoctor
  + 24 slots ₹300, partner with approved vendor DMOP + 6 live listings, CALD3 partner-only).
  `--remove` refuses once demo orders/consultations/prescriptions exist. Run locally,
  screenshots taken, removed again. Jest: guard, env APP_ENV, storage link, catalogue/PNG.

## Sprint 22 — backups and release signing (2026-10-01, uncommitted)
- Staging `backup` service (deploy/staging/backup/: Dockerfile node:20-alpine3.22 +
  postgresql16-client, `backup.sh`, `lib.sh`, `s3.mjs` on @aws-sdk/client-s3 3.1144.0):
  nightly at BACKUP_AT 02:30 Asia/Kolkata, `pg_dump -Fc` streamed by multipart upload to
  S3 (SSE AES256), nothing on the host disk; object only committed if pg_dump exits 0.
  Keys `backups/monthly/YYYY/MM/…` (first of IST month, 8 y, C-34) and `backups/daily/…`
  (35 d) — lifecycle rule `deploy/staging/backup-lifecycle.json`, or BACKUP_PRUNE=true.
  BACKUP_S3_BUCKET / BACKUP_S3_ENDPOINT / BACKUP_AWS_* else the API's AWS_S3_BUCKET etc.;
  without a bucket the service idles and logs "backups are OFF". Failure → "BACKUP FAILED"
  log line, non-zero exit, one retry; check.sh fails if the newest backup is > 26 h old
  (skipped when no backup container / not configured).
- `deploy/staging/restore.sh <key|latest> [--keep] [--into-live]`: streams into
  `dawabag_restore_check`, counts users/orders/products + last migration, drops it;
  `--into-live` needs no open connections + typed DB name, swaps by rename and keeps
  `<db>_pre_restore_<time>`. Fake S3 (backend/test/fakes/s3.mjs) gained LIST, DELETE and
  multipart for local tests. RUNBOOK 7c rewritten (procedure, quarterly restore test).
- Android release signing: build.gradle.kts reads ANDROID_KEYSTORE_PATH /
  _KEYSTORE_PASSWORD / _KEY_ALIAS / _KEY_PASSWORD (env, else android/key.properties);
  missing → release tasks fail fast (taskGraph check), never debug-signed. CI mobile job:
  if secrets ANDROID_KEYSTORE_BASE64 + passwords exist and vars.MOBILE_API_URL is https,
  builds a signed AAB (build number = run number), artifact `dawabag-release-aab`, key in
  RUNNER_TEMP deleted after; otherwise skipped with a notice. RUNBOOK 7b: keytool, secrets,
  Play App Signing. Open: owner creates the upload key and the backup bucket.

## Sprint 22 — bulk photo upload (2026-10-01, uncommitted)
- Admin/super_admin `POST /products/images/bulk` (multipart `images`, ≤ 50 files, ≤ 60 MB
  per request by Content-Length, 8 MB hard per-file multer cap; own rate limit
  PHOTO_BULK_RATE_LIMIT_MAX, default 60/15 min). File name `<SKU>.<jpg|jpeg|png|webp>`
  (`utils/skuFromFilename.ts`, case-insensitive SKU match; the extension is the declared
  type, so bytes must match it). Each file goes through `setProductImage` (same key scheme,
  checks, pending_review C-19, `product_image_set` audit C-46) plus one
  `product_images_bulk` batch audit entry. Results per file `{file, sku, product_id?,
  status: uploaded|skipped|failed, message}`: unknown SKU / duplicate in batch → skipped;
  bad name / bad bytes / > 2 MB → failed. No store → 503 for the whole request.
  Service `services/productImageBulk.service.ts`, controller `productImageBulk.controller.ts`.
- Web `/admin/products/photos` (menu Catalogue & stock → Pack photos; "Photos" button on
  Products): choose files / folder / drop → SKU mapping table with local checks → batches
  of ≤ 50 files and ≤ 40 MB with progress → results table + link to the review queue.
  `lib/admin/bulkPhotos/*`, `components/admin/products/bulk/*`; files only in React state.
- Tests: `test/sprint22.smoke.mjs` (in `test:smoke`; 503 path by default, mixed batch with
  the fake store), jest `skuFromFilename.test.ts`, one e2e check of the mapping table.

## Sprint 21 — security review, policies, headers (2026-10-01)
- Security review of Sprints 15–20: 7 fixes (placeholder secrets refused in
  production, no S3_ENDPOINT/fake store in production, staging port check,
  Caddy log redaction of e-Rx codes, email body escaping, CI permissions,
  UTC pinned in code via config/timezone.ts, mobile release requires https).
  Open: Android release signing key (owner).
- Website sends X-Frame-Options DENY / frame-ancestors 'none', nosniff,
  referrer and permissions policy from next.config headers() (no full CSP yet:
  signed photo links' host varies).
- Policy drafts (Claude Docs, for lawyer review, not yet published): Shipping v1
  and Cancellation, Returns and Refunds v1.
- Recorder uploads sample pack photos and has them approved; R2 page republished.

## Sprint 21 — product photos (2026-10-01)
- Admin/super_admin `PUT /products/:id/image` (multipart `image`, JPEG/PNG/WebP,
  ≤ 2 MB, type from magic bytes and must match the declared type —
  `utils/imageCheck.ts`) → object store key `products/<id>/<uuid>.<ext>` (old objects
  kept); `DELETE /products/:id/image` clears the key. Both audit-logged
  (`product_image_set` / `product_image_removed`, C-46).
- C-19: a new photo sets `content_status = 'pending_review'` (same pharmacist queue as
  copy; the queue returns `image_url` and the web review card shows it). Customers get
  `image_url` only when `content_status = 'approved'` (SQL `approvedImageKeySql()`);
  staff (admin list/detail, queue) always see the current photo.
- URLs: presigned S3 GET links (1 h, `response-cache-control` max-age 3600), reused
  per key for 50 min from an in-process map (`services/productImage.service.ts`), so
  browsers can cache; bucket stays private; no store → `image_url` null.
  `image_url` on search, product detail, cart lines, order detail items, partner
  catalogue search, admin list/detail. If a CSP is added, `img-src` must allow the
  S3 host (or S3_ENDPOINT).
- Web: `ProductImage` shows `image_url` (plain img, onError → placeholder); admin edit
  page has `ProductPhotoPanel`. Mobile: `ProductImage.imageUrlOf` reads only
  `image_url`; `CartLine.imageUrl`; frameBuilder/errorBuilder fall back to placeholder.
- Tests: `test/sprint21.smoke.mjs` (in `test:smoke`; 503 path without a store, full
  path with AWS_S3_BUCKET=dawabag-fake-bucket + S3_ENDPOINT=fakes); fake S3 now
  refuses expired presigned links and echoes response-cache-control; jest
  `imageCheck.test.ts`; Flutter widget tests; one e2e check of the admin panel.

## Security review of Sprints 15–20 (2026-10-01, uncommitted)
- `config/env.ts`: placeholder check also catches `change-me` (staging template values
  were accepted as production JWT secrets/DB password); production refuses the fake
  object store (bucket/keys "fake") and S3_ENDPOINT (only a warning with
  ALLOW_MISSING_INTEGRATIONS=true, i.e. closed staging) — C-44.
- `config/timezone.ts` imported first in index.ts pins the process to UTC (DATE columns
  shifted a day on an IST host).
- Notification email bodies are HTML-escaped in `notifications/dispatcher.ts`.
- CI: `permissions: contents: read`; MOBILE_API_URL passed via env.
- Staging Caddy: access logs redact e-prescription check codes; website sends
  X-Frame-Options DENY + frame-ancestors 'none'; check.sh port checks fixed (the old
  one passed even with 5432 open) and Redis/framing checks added.
- Mobile `config/api_url.dart`: release builds refuse a non-https API_URL.
- Open: website has no anti-framing/CSP headers outside staging Caddy (add in
  next.config `headers()` or the production front door); release APK still signed
  with debug keys (needs an upload key before Play).

## Sprint 20 — free delivery and partner stock (2026-10-01)
- Free delivery for retail orders whose medicines (after coupon, before GST) reach
  `delivery.free_above_paise` (₹499; null = off; migration 20). Cart API returns
  `free_delivery {above_paise, remaining_paise}`; web/mobile show a progress line.
  Shipping policy v1 drafted as a Claude Doc for lawyer review (not yet published).
- Partner stock counts towards availability but stays in `partner_inventory`:
  `services/stock/partnerStock.ts` (read-only SQL, same eligibility as allocation);
  search, product page and cart use GREATEST(own, best single partner).

## Sprint 20 — owner choices and rehearsal R2 (2026-10-01)
- Owner chose **Direction A (clinical trust)** and **rehearsal R2 (recorded journeys)**
  from the design review (artifact "Dawabag Design Review").
- `scripts/record-journeys.sh [out]` + `e2e/journeys/`: records customer (OTC and
  Schedule H), pharmacist, packer, rider and admin journeys as captioned screenshots
  (phone + laptop) through the real screens; Razorpay Checkout is stubbed onto the
  fake gateway and prescription uploads use `backend/test/fakes/s3.mjs` (in-memory,
  opt-in via S3_ENDPOINT — not in dev-env, sprint1 smoke expects 503 without S3).
  Output (steps.json + shots) goes outside the repo. Published as "Dawabag Rehearsal R2".
- Found by the rehearsal and fixed: pack/dispatch queue flagged OTC lines as awaiting
  a prescription (`rx_cleared` now = prescription attached, or not Schedule H/H1, or a
  KYC-approved trade buyer — same rule as payment capture); order confirmation now
  shows total paid incl. delivery; phone search placeholder shortened.
- e2e clean-up (`support/data.ts`) deletes by following foreign keys, so fully
  fulfilled test orders are removed.
- Gotchas: dev-env exports PORT=4000 (the API's) — start the website with PORT=3000;
  stale `next-server` processes answer on :3000 with an old build; `pkill -f` patterns
  must not match the calling shell's own command line.
- R2 extended (2026-10-01): journeys split into `e2e/journeys/flows/` (one file per
  journey; `record.spec.ts` only orders the story, `lib/story.ts` carries order numbers).
  New: Doctor consultation (admin enables doctor 9000001906, registration verified C-22,
  slots, pharmacist List A C-23, patient books/pays, join screens only — no Agora call,
  e-prescription C-24, public code check), Partner pharmacy (vendor 'E2E Lake Road
  Pharmacy' at PIN 499919, prefix LRP, owner 9000001907, product E2E-ORS; approval,
  listing, order allocated to partner, dispatch/deliver, settlement C-32), Returns and
  refunds (damaged item on the delivered OTC order, pharmacist approves, refund held at
  fake Razorpay then settled by signed refund.processed webhook, disposal, C-37).
  99 steps, all on screen. e2e clean-up also removes 'E2E %' vendors and their series.
- Found by the extended rehearsal and fixed (website): doctor login went to a missing
  /doctor/dashboard (now /doctor); order timeline showed prescription steps on OTC
  orders (now only when `requires_prescription`; sprint1 smoke checks the order detail);
  settlement toast showed ₹NaN (BIGINT net_payable_paise arrives as a string); vendor
  approval allowed 2–10-char invoice prefixes but the server takes 2–4.
- Noted, not changed: cart/product stock counts only Dawabag batches, so a product
  stocked only by partners shows out of stock (owner decision needed).

## Direction A — clinical trust redesign (mobile, 2026-10-01)
- Theme: brand green aligned with the web (#167A4C / #105C38); Material 3 NavigationBar.
- Customer shell tabs: Home, Search (`/search`, new), Orders, Account. Cart is now a
  full-screen route opened from the app-bar cart icon (`widgets/cart_action_button.dart`).
- Home (`screens/shop/home_screen.dart` + `widgets/home/*`): search entry (opens Search),
  trust strip, prescription CTA (sheet explaining the existing checkout prescription step,
  C-08 — no standalone upload endpoint exists), "Consult a doctor" (/doctors), server
  category tiles (filter), product grid, compact expandable "Licences, pharmacist &
  grievance officer" tile (`widgets/legal/legal_summary_tile.dart`, C-04/C-36).
- `providers/catalog_provider.dart` holds product search/categories; pincode is memory-only.
- `widgets/product_image.dart` (network image only if the API sends a full URL — today it
  sends only `s3_image_key`, so placeholders show) + `utils/dosage_form.dart`.
- Product page shows C-17 declarations, hiding empty rows; description only when approved.
- `widgets/empty_state.dart` used by cart, orders, search. Cart names the delivery charge as
  "shown at checkout" (cart API has no delivery figure; no consumer free-delivery threshold).

## Direction A — clinical trust redesign (web, 2026-10-01)
- Home (`app/page.tsx` + `components/home/*`): HomeHero search ("Search medicines, e.g.
  Dolo 650", `?focus=search`), TrustStrip (licence badge → /legal), PrescriptionCta (links
  /cart — upload happens at checkout, C-08), Consult a doctor, CategoryTiles (replaced
  CategoryChips), ProductResults (skeletons + EmptyState).
- `components/shop/ProductImage.tsx` + `lib/shop/dosageForm.ts` replace the 💊 emoji
  (API exposes only `s3_image_key`, so the initial + dosage-form tile shows).
- Product page: empty declaration rows hidden; "awaiting pharmacist review" only for staff.
- `components/layout/BottomNav.tsx` (phones; not in portals/checkout or for staff roles);
  `lib/layout/portalPaths.ts`. Footer hidden in /admin /staff /partner /doctor; phones get a
  one-line licence summary + `<details>` with LegalBlocks (C-04/C-36). Toaster top-center
  below the header.
- Cart: `DeliveryChargeLine` shows the server's pincode shipping charge for the default
  address (from /products/search pincode_info), else "Shown at checkout"; none for B2B.
- Admin menu: seven sections in `lib/admin/navSections.ts`, collapsible, with a filter.
- `components/ui/EmptyState.tsx` used by cart, orders, home results.

## Sprint 20 — IST everywhere (web, mobile)
- Owner rule: every date/time shown or computed is India Standard Time (Asia/Kolkata,
  UTC+05:30, no DST), whatever the viewer's device/browser zone.
- Web: one module `frontend-web/src/lib/dates.ts` (IST_TZ, formatDateIST '01 Oct 2026',
  formatDateTimeIST '01 Oct 2026, 2:05 pm', formatTimeIST, formatClockTime, `{ zone: true }`
  appends " IST", todayIST, daysAgoIST, lastMonthIST, isOnOrAfterTodayIST, nowISTInput,
  istInputToIso / isoToISTInput for datetime-local). Old copies (utils.formatDate,
  admin/format, fulfilment/roles, recallAlerts/time, incidents local-time inputs,
  telemedicine formatSlotDate/Time) removed; all imports point at lib/dates.
  'YYYY-MM-DD' values are never zone-shifted. Staff deadlines, slot times and
  datetime-local labels say IST.
- Mobile: one helper `mobile/lib/utils/ist.dart` (toIst = UTC+5:30, never .toLocal();
  formatDateIst, formatDateTimeIst, formatTimeIst, formatClockTime, istCalendarDay,
  todayIst/todayIstDate, isOnOrAfterTodayIst); formatters.dart keeps only money;
  consult_format.dart delegates. Slot times show "IST". Tests: mobile/test/ist_test.dart.

## Done in Sprint 20 (critical journeys in the browser)
- e2e: checkout to the payment step with C-35 disclosures (seller + licence, country of origin,
  delivery charge, refund/return policy links); Schedule H order blocked at the prescription step
  until a prescription is given; footer licence/grievance details; pharmacist lands on the queue.
  29 browser tests pass locally. CI fixes: website built with NODE_ENV=production in the browser
  job; file_picker 10 (6.x used the removed Flutter v1 plugin API and broke the APK build).

## Done in Sprints 18–19 (staging, browser tests, accessibility)
- deploy/staging: compose stack behind Caddy (auto HTTPS), staging.env git-ignored, check.sh; CI job
  "staging" starts it with Caddy's own CA and runs the checks (green on first run).
- e2e/ (Playwright 1.56 + axe): 25 browser tests (desktop + phone) — search, product declarations,
  httpOnly session cookie, server-held cart seen from a fresh browser, admin access/denial, no
  localStorage/sessionStorage, WCAG 2.1 AA on public pages. CI job "browser".
- Accessibility fixes: brand-600 #167A4C / 700 #105C38, gray-400 → #6B7280, text-green-600 → 700,
  aria-labels on cart/account/sign-out icons and the password toggle.
- Android: plugins compiled against SDK 36 (agora was on 31); app id com.dawabag.app.
- dev-up.sh starts the API with setsid/disown (no longer hangs a piped shell).

## Done in Sprint 17 (installable mobile app)
- Flutter 3.47.5 installed locally at /opt/flutter-sdk (not in the repo); android/ and ios/ generated
  (app id com.dawabag.app — `in.` is a Java keyword so in.dawabag.* is impossible; owner to confirm before the first store upload).
  Permissions: camera, mic, notifications, network; iOS usage texts; allowBackup=false; minSdk 24;
  desugaring for flutter_local_notifications.
- Firebase optional: options from --dart-define (lib/config/firebase_config.dart); app starts without.
- Unused plugins removed (maps, local_auth, camera, share_plus, lottie, shimmer, connectivity,
  package_info, crypto, codegen). pubspec.lock committed.
- CI builds a debug APK artifact (dawabag-debug-apk; API from repo variable MOBILE_API_URL).

## Done in Sprint 16 (dependencies, mobile build, images, indexes)
- npm audit 0 on backend and web: Next.js 15.5.27 + React 19 (14.x unpatched: RCE/SSRF/DoS), PostCSS
  override, nodemailer replaced by the SES API, uuid 11 override. CI fails on high/critical advisories.
- Mobile analysed and unit-tested in CI for the first time (Flutter stable): 1 error fixed, warnings
  fixed; cached_network_image dropped (its on-device SQLite cache broke the no-local-storage rule).
  Remaining infos: DropdownButtonFormField `value` deprecation kept on purpose (initialValue would stop
  following state); prefer_const style notes.
- CI builds both Docker images; the API image migrates an empty DB and answers /ready, the web image
  serves the home page.
- Migration 18: indexes for hot child lookups and recall batch keys.

## Done in Sprint 15 (engineering readiness)
- `scripts/dev-env.sh` + `scripts/dev-up.sh`: one command from a fresh machine (or this container after a
  restart) to a migrated API on the fake providers; Redis without snapshots.
- GitHub Actions CI on every push/PR: backend tsc, jest, migrations ×2 on empty Postgres 16, all smoke
  suites; web tsc, lint, build. First runs green.
- X-Request-Id on every request (access/error logs `rid=`, error replies `request_id`); admins alerted once
  when a scheduled job starts failing (`job_failed`).
- Mobile: doctors list a day's consultations, join the call and end it (prescribing stays on the web).
- Tests: Sprint 1–15 smoke 700 checks, jest 67.

## Done in Sprint 14 (backend)
- Regulator recall alerts (C-28): CDSCO NSQ / FDA / manufacturer lists uploaded (.xlsx/.csv in memory) or
  typed in; batches matched on letters+digits against own and partner stock held or sold; each match
  recalled or cleared with a note; 4-hour deadline, admin alerts at entry and when overdue
  (job recall_alert_watch); receipts, partner listings and opening stock refused for a batch on an alert
  until cleared for that product, and for a recalled batch always. Migration 17 (final records).
- Security review of Sprints 12–13: 10 findings (5 medium) fixed with tests — riders: no order list or
  invoices; consultation refunds settle only when processed (webhook + sweep retry); WhatsApp allow-list
  (no health values); settlements respect the GST lock; courier-booking race; dispatch message after
  commit; call tokens ≤ 30 min; cart purge progress; recall notices kept; consent notice language;
  TRUST_PROXY_HOPS required in production.
- Tests: Sprint 1–14 smoke 696 checks pass, jest 64. Note: the container restarted mid-sprint and the
  local Postgres was recreated empty; all migrations 01–17 and suites ran green on it.

## Done in Sprint 13 (backend)
- Own riders: dispatch to a rider (rider_id) or a courier (response carries the DWR AWB), reassign (packers see the deliver queue for it), rider run sheet
  (GET /fulfilment/my-run), delivered/invoice limited to the rider's own parcels, delivery
  role 404 on orders — closes the Sprint 12 review item on delivery-staff scope (C-26, C-41).
- Agora call tokens on join (uid, token, token_expires_in) — closes the video-token item (C-23).
- GST period lock `accounts.locked_until` for GRNs and supplier credit notes (C-31).
- WhatsApp through MSG91 templates after opt-in consent (`whatsapp` purpose).
- Tests: Sprint 1–13 smoke 653 checks pass, jest 60, fresh-DB migrations 01–16 apply.

## Web Sprint 14 — video calls (tsc + next lint + next build pass)
- `agora-rtc-sdk-ng` ^4.24.8, imported only inside the call hook's effect; CallRoom loaded
  with next/dynamic ssr:false. lib/telemedicine/useAgoraCall.ts (join with the string user
  account uid, publish mic/camera, subscribe, mute = setMuted, camera off = setEnabled,
  token-privilege-will-expire → GET /consultations/:id/join again → renewToken, remote
  left, always close tracks + leave on unmount) and callStatus.ts (status/error wording).
- components/telemedicine/call/: CallRoom (full-screen), CallStage, VideoTile,
  CallControls, CallStatusLine. JoinDialog shows "Start video/audio call" when mode is
  video/audio and the server sent a token; token null keeps the "not set up" note; chat
  keeps the old text. useJoin keeps { id, info }. Patient + doctor both. Audio mode = mic
  only. C-23: patient and doctor only, nothing recorded; nothing stored in the browser.

## Web Sprint 14 — recall alerts (tsc + next lint + next build pass)
- /admin/recall-alerts (admin/super_admin; layout RequireAuth MANAGER_ROLES; nav "Recall
  alerts" under Batch recalls): Open / All tabs, rows with source label, reference,
  received + deadline (IST) and a live "Xh YYm left" / red "Overdue" badge computed from
  due_at vs the clock (useNow, nothing stored), lines/matches/to decide/recalled/cleared.
- "Upload list" (multipart .xlsx/.csv ≤ 5 MB; columns Drug name, Batch No., Manufacturer,
  Reason) and "Type in alert" (editable rows) dialogs share AlertHeaderFields: source,
  reference, received at as datetime-local read as India time → ISO with +05:30, not in the
  future. Success → detail page; 422/400 show the server message.
- /admin/recall-alerts/[id]: summary card + lines (matched first). Matches show our product,
  maker, batch spellings, held/sold, decision; pending → Recall (confirm dialog naming
  product, batches, units, buyers told to stop using it) or "Not this product" (note ≥ 5);
  decided → who/when/notes + "View recall" (/admin/recalls/:id); 409 re-reads the alert.
  Every line has "Clear a product refused at receipt" (recalls ProductPicker + note);
  unmatched lines read "Not held".
- GRN form: 409 "recall alert RA-…" shows RecallAlertBanner (link for admins).
- Files: lib/recallAlerts/{api,types,labels,time}.ts, components/admin/recallAlerts/*.

## Mobile Sprint 15 — doctor join (not compiled — no Flutter SDK here)
- /doctor/portal is now a small hub → /doctor/consultations (DoctorConsultationsScreen:
  day list from GET /consultations/doctor?date=YYYY-MM-DD, IST today by default, DayBar
  prev/next + date picker). Card: slot time, patient name/gender/age, mode, status, payment.
- "Join" on open rows calls GET /consultations/:id/join (server 402/409 text in a snackbar),
  then pushes /consultations/:id/call with the ConsultJoin as GoRouter `extra`
  (VideoCallScreen.initialJoin; patients still use consultJoinProvider). Call screen closes
  to /doctor/consultations for role 'doctor'. "End consultation" (in_progress only) →
  POST /consultations/:id/end { notes? }. Prescribing stays web-only (note on rows).
- Files: models/doctor_consultation.dart, services/doctor_consultation_api.dart,
  providers/doctor_consultation_provider.dart, screens/doctor/portal/ (+ widgets/).

## Mobile Sprint 14 — video calls (not compiled — no Flutter SDK here)
- services/video_call_service.dart (ChangeNotifier over agora_rtc_engine 6.x: permissions
  via permission_handler, initialize, enableVideo/startPreview, joinChannelWithUserAccount,
  onTokenPrivilegeWillExpire → refetch join → renewToken, leave/release on dispose).
- screens/consultations/call/video_call_screen.dart + widgets (local_preview, remote_view,
  call_controls, call_status_banner); route /consultations/:id/call reuses
  consultJoinProvider. Join screen "Start video/audio call" when a token was issued.
- No android/ios folders in the repo: add CAMERA/RECORD_AUDIO/INTERNET (Android) and
  NSCameraUsageDescription/NSMicrophoneUsageDescription (iOS) when they are generated.

## Web Sprint 13 (tsc + next lint + next build pass)
- Dispatch dialog: "Our rider" (RiderSelect from GET /fulfilment/riders) or courier — never
  both; courier-booked packs stay courier-only. After a rider dispatch the DWR… run reference
  is read back from GET /orders/:id (dispatch response has no AWB) and shown (RunRefNotice).
  Deliver tab: "Reassign rider" on parcels whose courier is "Dawabag rider" (admin/super_admin
  only — packers cannot see the deliver queue; the endpoint itself also allows packers).
- Delivery role: /staff/run-sheet (RunSheet + RunStopCard: address, contact, seal, run ref,
  code needed, line count, invoice; no medicines, no order links) with HandoverDialog (no
  override). Fulfilment tabs render the run sheet for riders; nav "Run sheet"; login/header
  route riders there; header "Orders" hidden for delivery.
- Join dialog: "Secure call link valid for N minutes" from token_expires_in; token null →
  "video service not set up" (no web video SDK wired yet). lib/telemedicine/callToken.ts.
- Privacy: ConsentToggleRow for marketing + WhatsApp ("Send order and refill updates on
  WhatsApp", can be turned off any time) → PUT /privacy/consents/whatsapp (C-42).
- Settings: AccountsLockSection ("GST period locked up to", date ≤ UTC yesterday or clear,
  confirm step) and WhatsAppTemplatesSection/Editor (type → name [a-z0-9_], language
  xx/xx_XX, ordered vars ≤ 10; mirrors server zod; 422 list shown). GRN form and supplier
  credit-note dialog show a LockedPeriodBanner on "closed GST period" 409s.

## Mobile Sprint 13 (not compiled — no Flutter SDK here)
- ConsultJoin gains uid/token/tokenExpiresIn; join screen shows CallLinkNotice (valid N
  minutes, or video service not set up when token is null). agora_rtc_engine is in
  pubspec but no call client is wired, so the token is not passed anywhere yet.
- Privacy: WhatsApp SwitchListTile ("Send order and refill updates on WhatsApp") →
  PUT /privacy/consents/whatsapp via PrivacyNotifier.setWhatsApp.
- Rider run sheet skipped: the app has no staff/delivery section (customer + doctor only).

## Web Sprint 12 (tsc + next lint + next build pass)
- Policies in en/mr/hi (C-40): /policies/:key switcher (?lang=, "Not yet available in …;
  showing English"), index links translations; /admin/policies "Publish translation"
  (PolicyTranslationForm) + history grouped per version with languages. Registration sends
  notice_language (notice link opens in that language); privacy screen shows "Privacy notice
  v3, Marathi". Settings: RetentionSection (retention.days) + catalogue.opening_stock_open
  switch. Doctor approve sends nmc_reg_number (409 → refresh), reject shows refunds count.
  Telemedicine lists pharmacist_rx only. Receive-without-PO admin only; free ≤ paid qty;
  PO approve / return hand-over / destruction hidden for the raiser. Blind counts (no
  system_qty), count-approve 409 banner. Consult 'refund_pending' = "Refund in progress";
  cancel refund {pending} = "Refund of ₹X initiated".

## Mobile Sprint 12 (not compiled — no Flutter SDK here)
- PolicyScreen gets an English/मराठी/हिंदी bar (policyInLanguageProvider, ?lang= route
  param, English-fallback note). Register: "Read the privacy notice in" dropdown, opens
  /policies/privacy?lang= in-app, sends notice_language. Privacy screen shows notice version
  + language. Device registration 409 logged and ignored. Consult refund_pending label and
  pending-refund snack.

## Web Sprint 11 (tsc + next lint + next build pass)
- /admin/refunds: "Retry with Razorpay" on pending gateway refunds with a failure_reason
  (POST /returns/refunds/admin/:id/retry; 409 texts shown), attempts count; UTR path kept.
  /admin/accounts: 'payment-reconciliation' report (≤31 days hint, server 400 shown,
  status colour-coded). Doctor: /doctor/slots lists own slots (GET /doctors/me/slots,
  booked/blocked shown, Block only free); prescribe page loads GET /consultations/:id
  (no ?date=); medicine search always shows the TPG list.

## Web Sprint 10 — teleconsultation (tsc + next lint + next build pass)
- Patient: /consult (verified doctors with qualification, council, reg. no./year, fee),
  /consult/[doctorId] (date + open slots, mode, chief complaint, TPG consent checkbox →
  book → Razorpay checkout.js, same script as order payment; no patients picker exists on
  web so no family member yet), /account/consultations (pay / join / cancel with refund
  toast / view Rx), /account/consultations/prescriptions/[id] (details, PDF via
  downloadFromApi, public check link, optional "Order these at Dawabag" → /use with "You may
  buy these medicines from any pharmacy", C-24). Join shows channel/mode/app_id; no Agora SDK yet.
- Public /eprescriptions/verify and /verify/[code]: valid/expired banner, doctor + registration,
  patient initials/age/gender, medicines.
- Doctor portal (role doctor; DoctorShell/DoctorNav, Header link now /doctor): /doctor (day list,
  join/end with notes/cancel, write/view Rx), /doctor/profile (registration form + status /
  rejection reason), /doctor/slots (date range × daily window × slot length × weekdays, ≤200
  per request; free slots with Block), /doctor/consultations/[id]/prescribe?date= (diagnosis,
  advice, new-condition toggle on follow-ups, 1–20 medicine rows via /products/search, server
  422 refusals one per line), /doctor/prescriptions/[id].
- Admin /admin/doctors (enable by mobile, status tabs, verify/reject with notes 3–1000) and
  /staff/telemedicine-lists (pharmacist_rx/admin: set List O/A/B/prohibited + notes; Schedule X /
  NDPS forced prohibited); both in AdminNav. Admin product table shows the tele list.
- Staff Rx viewer: /prescriptions/:id/url {digital, pdf_path} → DigitalRxViewer shows the PDF
  in memory (blob URL) via the authenticated client + download.
- lib/telemedicine/{types,api,doctorApi,adminApi,labels,slots,profileForm,prescriptionForm,
  razorpay,roles}.ts; components/telemedicine/{common,patient,doctor,admin,public}/*,
  components/staff/telemedicine/*; getApiErrorLines() in lib/apiErrors.ts; fetchApiBlob() in
  lib/download.ts. Public product search does not return telemedicine_list, so the prescribe
  form shows it only when present.

## Web Sprint 9 — e-invoices and purchase returns (tsc + next lint + next build pass)
- /admin/einvoices (admin, super_admin; AdminNav): "e-invoicing is off" banner (C-31),
  pending/failed/generated tiles, status tabs, table (IRN shortened, full in title, ack,
  IRP error), Retry on failed/pending rows. lib/einvoices/{api,types}.ts,
  components/admin/einvoices/*.
- Settings: einvoice.enabled as an on/off switch with a confirmation dialog (new
  'boolean' setting kind, components/admin/settings/SettingSwitch.tsx; super_admin edits).
- Dispatch dialog shows server refusals (409 IRN pending/failed) in a clear red box; pack
  toast notes "registering the e-invoice (IRN)" when einvoice_required.
- /staff/purchase-returns list, /new (supplier → its batches or "Recalled stock", free =
  available − reserved, cost value, server 422 lines one per line) and /[id] (approve /
  reject hidden for the requester, dispatch reference, supplier credit note with
  short/over difference). lib/purchaseReturns/{api,types,labels,form}.ts,
  components/staff/purchaseReturns/*. Nav entry for STORE_ROLES.
- Accounts: 'purchase-returns' report label. /staff/stock: "Recalled only" filter and
  paging from the server's total (fetchBatches now returns {batches,total}).

## Done in Sprint 11 (payments end to end)
- Migration 14. services/payments/{capture,checkout,webhook,reconcile}: one idempotent capture path
  (verify, webhook, sweep) for mandates, consultation fees, orders and refill charges; webhooks
  signed + de-duplicated (payment_webhook_events); refund.processed/failed, token.*; refund retry;
  job payment_reconcile; report payment-reconciliation (live Razorpay settlements, ≤ 31 days).
- Fixed: attaching a refill to a mandate always failed (untyped SQL parameter).
- Tests: test/sprint11.smoke.mjs (35); sprints 3 and 5 now run against the fake Razorpay;
  sprints 1–11 = 583 checks; jest 58.

## Done in Sprint 10 (teleconsultation, TPG 2020)
- Migration 13. Doctors verified against the council register; TPG medicine lists (O/A/B/
  prohibited) set by pharmacists; consult modes, consent, first/follow-up; Razorpay fee and
  refunds; e-prescriptions final, PDF on demand, public check code, sent to the pharmacist
  unverified when the patient chooses Dawabag. Legacy monolithic route files replaced.
- Tests: test/sprint10.smoke.mjs (65).

## Done in Sprint 9 (e-invoicing, document numbers, purchase returns)
- Migration 12. Document numbers now fit CGST Rule 46's 16 characters: `DWB/2627/00012`,
  credit notes `DWBC/2627/00001`, PO/GRN/PRN likewise; counters continue (gap-free); the
  function raises above 16; partner prefixes 2–4 chars.
- E-invoicing (C-31) against the common IRP API: B2B Dawabag invoices registered at packing,
  dispatch blocked until the IRN is back, credit notes registered against their invoice, IRN +
  signed QR on the PDF, queue + sweep, Admin → E-invoices (retry). Off until einvoice.enabled.
  The unused v2 per-order e_invoices code/table was retired.
- Purchase returns (C-28): raise → second-person approval (stock out as return_to_supplier
  adjustments) → dispatch reference → supplier credit note; report `purchase-returns`.
- Tests: test/sprint9.smoke.mjs (52 checks) against test/fakes (shared fake providers incl. an
  IRP with the real encryption); sprints 1–9 pass; jest 50.

## Done in Sprint 8 (delivery and communications)
- Migration 11: user_devices (several phones per user), notification_deliveries (every
  SMS/email/push attempt: sent / failed / skipped + reason), shipment courier columns,
  shipment_tracking_events; settings courier.provider, courier.pickup_location, sms.dlt_templates.
- Notifications split into notifications/{templates,dispatcher,channels/{sms,email,push}}.
  SMS only through MSG91 DLT templates mapped in sms.dlt_templates (free text never sent);
  push through FCM HTTP v1 (service-account JWT, token cached in memory, unregistered
  tokens deleted). Admin → GET /admin/notification-deliveries.
- Shiprocket: POST /fulfilment/shipments/:id/book-courier (packed, no AWB; courier sees
  "Pharmacy items" only, C-41); dispatch can reuse the booked courier/AWB; webhook
  POST /courier/shiprocket/webhook (x-api-key = SHIPROCKET_WEBHOOK_TOKEN, idempotent,
  zone-less times read as IST): out_for_delivery notifies the buyer, delivered closes
  non-Rx parcels (Rx parcels need the code, admins alerted, C-26), RTO alerts admins once.
  Buyer order detail returns tracking_status, rto_at, tracking[].
- Admin settings accept the Sprint 7/8 keys (were missing). Receipts list filters + paging;
  destruction register CSV. Production refuses the test-only *_BASE_URL overrides.
- Web Sprint 8 (tsc, lint, next build pass): /admin/notifications (7-day per-channel
  summary, status/channel filters, failed rows show the reason); settings: courier.provider,
  courier.pickup_location, purchasing.min_shelf_life_days, stock.near_expiry_days editors
  and a table editor for sms.dlt_templates (lib/admin/dltTemplates.ts); dispatch queue
  "Book courier (Shiprocket)" and optional courier/AWB once booked; buyer order shows a
  courier tracking timeline + RTO notice; /staff/receive filters (supplier, GRN/invoice
  search, dates) with paging; destruction register "Download CSV" via downloadFromApi.
- Tests: test/sprint8.smoke.mjs (51 checks) against one fake provider server
  (test/sprint8/fakes.mjs; env from fake-env.mjs); sprints 1–8 = 428 checks; jest 47.

## Done in Sprint 4 (beta readiness)
- Migration 07. Pharmacist prescription gate with quantities and reuse (C-08), H1 register
  + CSV export (C-09), Dawabag pack/dispatch/deliver with stock deduction, invoice PDF per
  shipment (C-13), MRP/NPPA price checks (C-16), grievances with 48 h / 30 day deadlines
  (C-36), legal footer data (C-04), batch recall (C-28), prescription-view audit (C-41),
  privacy consents/export/erasure (C-40, C-44), listing rejection codes REJ-01..14.
- Tests: test/sprint4.smoke.mjs (63 checks) + Sprint 1–3 suites + 21 jest tests pass.
- Web and mobile Sprint 4 screens: see the latest commits.
- Web Sprint 4 (tsc + next build pass): /staff/fulfilment tabs (Rx verify, Pack, Dispatch,
  Deliver, H1 register + CSV) shown per role; /account/complaints (list/new/thread);
  /account/privacy (consents, marketing toggle, history, export, correction/erasure);
  /admin/grievances (status + overdue filter, reply, status/resolution); /admin/recalls
  (list, create with product search, affected orders); /admin/privacy (request queue);
  invoice PDF download per shipment on buyer order detail, partner shipments and staff
  queue (fetched via Bearer client, lib/download.ts — nothing kept locally).
- Web gaps needing backend: buyer cannot list own data requests (no GET /privacy/requests);
  GET /grievances/:id has no buyer_name; delivery role not allowed to fetch invoices;
  recall detail has no recalled_by_name; eslint is not configured in frontend-web.
- Mobile Sprint 4 (not compiled): complaints list/new/thread (/account/complaints),
  privacy consents + erasure/correction requests (/account/privacy; export is web-only),
  public About & legal (/legal), order timeline handles every status, invoice number +
  "PDF on website" note (endpoint is Bearer-only, no file writes), checkout split.
- Owner to fill in: legal.* settings (entity, licences, pharmacist-in-charge, grievance
  officer); appoint the pharmacist-in-charge and grievance officer.

## Web Sprint 7 — purchasing and stock control (tsc + next lint + next build pass)
- lib/purchasing (types, api, roles STORE/PURCHASE_ADMIN, productSearch, receiptForm) and
  lib/stock (types, api, labels); formatPaise added to lib/admin/format.ts.
- /admin/suppliers (list, add, approve via the existing ApproveVendorDialog, C-02);
  /admin/purchase-orders (+ /new, + /[id] with approve, cancel, close short, receive link);
  /staff/receive (open POs + receipts by date) /new?po= (lines prefilled with the remaining
  qty, split a PO line into batches, server 422 problems listed one per line) /[id];
  /staff/stock (batches, expiry tabs, adjust request); /admin/stock-adjustments (approval
  queue, 403 → two-person message, C-46); /staff/destruction-register (record disposal,
  C-28/C-34); /staff/stock-counts (+ /[id] blind count sheet: system qty hidden until
  submitted; approve by a different admin). AdminNav links by role; nav active match is now
  per path segment. purchase-register / stock-valuation labels added to Accounts reports.
- Backend gaps: adjustments list has no requested_by id (cannot hide Approve on own
  requests); counts list has no counter / approver names; GET /products/admin/list is
  admin-only, so pharmacists receiving without a PO search active products only;
  receipts list has no supplier/PO filter or pagination; batches list returns no total.

## Done in Sprint 7 (purchasing and stock control)
- Migration 10; suppliers, purchase orders, goods receipts (purchase register), two-person
  stock adjustments, destruction register, stock counts (blind on web), expiry_watch job,
  stock valuation; AWS SDK v3; legacy inventory routes retired; both Docker images build
  (NODE_IMAGE from ECR Public) and run.
- Tests: test/sprint7.smoke.mjs (40 checks); all seven suites pass, also on a migrations-only DB.
- Open: receipts list has no supplier/PO filter or paging; no destruction-register CSV.

## Done in Sprint 6 (beta launch readiness)
- Security review of money/access paths: 12 findings fixed (status route admin-cancel only,
  refund cap, payment webhooks, credit settlement, address/patient ownership, duplicate lines,
  coupons, wallet cap, partner handover/suspension, consultation ownership).
- Deployability: stdout logs, config checks, /ready, graceful shutdown, migration runner
  (`npm run db:migrate`, `--baseline 08` for pre-runner DBs), Dockerfiles, compose, docs/RUNBOOK.md.
  All suites pass on a DB built only by migrations; API image migrates an empty DB and runs.
- Migration 09: coupon redemptions, final-record triggers (C-34), saved-Rx request,
  cold-chain dispatch fields, security incidents.
- Catalogue/opening-stock import from the xlsx template (in memory); admin product list/detail
  (`/products/admin/list`, `/products/:id/admin`); accountant reports (`/accounts/reports/*`);
  saved Rx reuse (C-08); cold-chain dispatch record (C-25); incident register (C-43).
- Tests: test/sprint6.smoke.mjs (64 checks) + Sprint 1–5 + 35 jest tests pass.

## Done in Sprint 5 (after-sale care and consumer protection)
- Migration 08. Cancellation, returns, refund ledger, GST credit notes, partner settlement
  deductions (C-37); checkout preview (C-35); versioned policies (C-39); product declarations
  and pharmacist copy review, trade prices no longer public (C-17, C-19); sealed dispatch and
  delivery code (C-26); side-effect reports (C-29); licence register + alert job (C-07);
  doctor declaration (C-15); addresses; signed PDF links; `GET /returns/windows`.
- Defaults to confirm with the owner: DECISIONS.md "Sprint 5 defaults".
- Tests: test/sprint5.smoke.mjs (83 checks) + Sprint 1–4 suites + 25 jest tests pass.

## Mobile Sprint 5 (buyer screens, not compiled — no Flutter SDK here)
- Checkout: address → review (POST /orders/preview: per-seller block with licence and
  delivery estimate, lines with country of origin, charge break-up, returns note, policy
  links; C-35) → place order → prescription → payment. Doctors tick an unticked
  practitioner declaration, sent as practitioner_declaration (C-15); also added to register.
- Order detail: delivery code card (C-26), seal / received-by per shipment, invoice and
  credit-note PDFs via signed links opened in the external viewer (no local file), cancel
  (can_cancel), refunds / credit notes / returns card, "Report a problem" per delivered
  shipment and "Report a side effect" per line.
- New screens: /account/returns (+ /new, /:id), /account/side-effects (+ /new),
  /account/addresses (+ /new, /:id/edit), public /policies/:key; policies listed on About &
  legal; privacy screen lists GET /privacy/requests.

## Web Sprint 5 (tsc + next lint + next build pass)
- Checkout: address → review (POST /orders/preview, C-35: seller + licence + estimate,
  lines with origin/expiry, charge break-up, returns note, policy links) → place → Rx →
  pay. doc_hospital ticks an unticked own-patients declaration (C-15), also on register.
- Order detail split into components/orders/*: shipments with seal, delivery code (C-26),
  receiver; cancel (can_cancel); returns/refunds/credit-note PDFs (C-37); "Report a
  problem / return" per delivered shipment; "Report a side effect" per line (C-29).
- New buyer pages: /account/addresses, /account/returns (+[id], refunds list),
  /account/side-effects (+new, [id]), /shop/[productId] with declarations (C-17/C-19),
  public /policies and /policies/[key] (C-39, text only, no HTML); privacy page lists
  own requests; footer policy links.
- Staff/admin: seal number on staff + partner dispatch; handover dialog (code, receiver,
  admin override) for staff/partner delivery and /admin/deliveries; /admin/returns and
  /staff/returns (+[id]) decide/close; /admin/refunds (mark paid with UTR, failure
  reason); /admin/policies (new version + history); /admin/licences (C-07);
  /staff/content-review (C-19); /staff/adverse-events (C-29); partner /partner/returns and
  settlement return adjustments.
- Backend gaps seen from web: fulfilment and partner shipment queues do not return
  handover_code_required / seal_number; return detail credit_notes have no id (PDF only
  from order page); no admin product create/edit screen exists yet on web.

## Web Sprint 6 (tsc + next lint + next build pass)
- /admin/products (search list), /new and /[id] edit (rupees in, paise out; only changed
  fields PATCHed; C-16 price checks mirrored, C-17 declarations, C-19 copy review note).
- /admin/catalogue-import: template download, preview (per-row errors/warnings), commit with
  "skip rows with errors"; the File stays in memory only.
- /admin/accounts: report + period (default last month), table (₹ for *_paise), CSV download.
- /admin/incidents (C-43): live 6-hour CERT-In countdown/overdue badge, log incident, record
  CERT-In / DPB / users notified, actions, status.
- Cold-chain dispatch (C-25): temperature 2–8 °C + logger ID on staff and partner dialogs.
- Checkout Rx step offers saved verified prescriptions (POST /prescriptions/:id/use-for-order);
  staff Rx queue shows "Buyer offered saved prescription" with View / Apply.
- No web UI used PATCH /orders/:id/status (admin-only cancel), so nothing to remove.

## Done in Sprint 3 (backend)
- Owner decisions: allocation rule (> ₹10k + Dawabag ≤24 h → own stock first, else
  nearest seller), partners sell at catalogue price, refills with reminders +
  auto-order + mandate auto-charge.
- Migration 06; allocation + per-seller shipments/invoices; gap-free invoice numbering;
  partner portal API; listing review with Schedule H1 gate; settlements with commission,
  fee, GST on fees, TCS, TDS; refills API + jobs; payment webhook and verify hardening.
- Tests: test/sprint3.smoke.mjs (48 checks) + Sprint 1/2 suites + 21 jest tests pass.
- Not exercised: Razorpay mandate/recurring calls (no keys).

## Done in Sprint 2 (backend + web client)
- Server cart, httpOnly cookie sessions, S3-only storage, no client storage (web).
- KYC review API, credit limits/settlement, scheduled jobs (licence expiry,
  GSTIN re-check, low stock, credit reminders), audit logging, coupon rule C-21.
- Fixed: credit columns missing (all credit orders failed), low-stock query
  ambiguous, KYC count-based approval, logout never revoked tokens.
- Tests: test/sprint2.smoke.mjs (43 checks) + Sprint 1 suite pass.

- Web admin screens: KYC review (queue + detail with per-check decisions,
  document links, reject, credit limit), vendors, low stock, open credit,
  jobs; route guards for /orders and /admin. KYC approval driven end to end
  in headless Chromium.
- Mobile: Hive/shared_preferences removed, server cart, refresh token only in
  keychain, register screen split into screens/auth/register/ (not compiled).

## Known gaps
- Razorpay tested against a stand-in gateway only; run a live test-mode ₹1 payment, refund and mandate. Replacement = new order.
- External penetration test pending (internal review done, 12 findings fixed).
- Policy texts must be published by the owner.
- WhatsApp channel not wired; GSTR-8 filing manual.

## Done in Sprint 1
- Migrations fixed (02 view, 03 unique index) and 04 added (registration fields,
  kyc_documents, consent_records, audit_logs.performed_by/notes, order fixes).
- Backend compiles (was 23 errors); runtime bugs fixed: order routes/params,
  product search SQL, notification payloads, order_items/orders schema mismatches.
- customer_type in JWT and on req.user; trade pricing gated on KYC approval.
- 4-step registration: API (per-type validation, consent, 18+), KYC document
  upload (`GET/POST /api/v1/kyc/documents`), web UI, Flutter UI.
- Schedule X / NDPS hidden from search. Doctor referral bonus removed.
- Tests: 12 jest unit tests; `test/sprint1.smoke.mjs` (all checks pass locally);
  web registration driven end to end in headless Chromium.

## Still open in Sprint 1 (need owner credentials/data)
- Fill PTR/PTS/Institutional prices in `templates/01_Medicine_and_Inventory.xlsx`.
- IRIS IRP sandbox e-invoice test; GSTIN/PAN KYC API sandbox tests.
- Flutter build on a machine with the SDK (`flutter pub get`, run on device).

## Next (before beta)
Owner data and credentials (legal settings, licence register, policy texts, API keys, S3,
Razorpay, MSG91), lawyer/CA sign-off on the rulebook and Sprint 5 defaults, Flutter build,
deployment per docs/Dawabag_Beta_Deployment_Guide.docx.

## Mobile Sprint 8 — push devices, tracking, notification taps (not compiled)
- services/push_device_service.dart + device_api.dart: POST /users/me/devices after every
  sign-in (completeSignIn) and on FCM onTokenRefresh; logout sends fcm_token. The FCM token
  is read live from FirebaseMessaging, never stored; no-op when Firebase is not initialised.
- models/shipment_tracking.dart + screens/orders/widgets/tracking_timeline.dart: per-shipment
  courier scans (newest highlighted, local time, location) and the RTO notice in ShipmentTile.
- services/notification_tap_router.dart: push taps (type dispatched / out_for_delivery /
  delivered / order_status / packed / payment_confirmed + order_id) open /orders/:id once
  the router exists and the session is restored.

## Mobile Sprint 10 — patient teleconsultation (not compiled — no Flutter SDK here)
- /doctors (public directory, speciality filter, paging; qualification + council + reg. no.
  on every card, TPG 2020 / C-22), /doctors/:id (profile + 14-day slot picker, IST),
  /consultations/book (mode chips, chief complaint 3–1000, consent text = web's
  TPG_CONSENT_TEXT), /consultations (status/payment chips; pay, join, cancel with reason,
  e-prescription), /consultations/:id/join (mode + channel; no Agora SDK yet — note says the
  call client opens there), /consultations/prescriptions/:id (TPG format, check code, "You
  may buy these medicines from any pharmacy", optional "Order at Dawabag" → /use; PDF is
  web-only, no file writes).
- Fee payment: screens/consultations/consult_payment.dart mirrors CheckoutRazorpay
  (POST /consultations/:id/pay → Razorpay sheet → /pay/verify). Nothing stored locally.
- New: models/doctor.dart, consultation.dart, eprescription.dart; services/doctor_api.dart,
  consultation_api.dart; providers/doctor_provider.dart, consultation_provider.dart;
  utils/consult_format.dart; api_utils.apiDataList for list envelopes. '/consultations'
  added to protected routes; Account → My consultations wired.
- Open: booking is always for the account holder (no patient-profile picker in the app
  yet); slot_date is read as an IST calendar day whether the API sends a date or an ISO
  timestamp.

## Session history
| Date | Change |
| --- | --- |
| 2026-02-14..17 | Kilo prototype (Next.js, mock data) |
| 2026-03-30 | v2 package produced in Claude chat (not in Git) |
| 2026-09-30 | v2 imported; compliance rulebook drafted; owner decisions logged; Sprint 1 registration/KYC built and tested |
| 2026-09-30 | Standing rules (server SSOT, modular); Sprint 2 backend + web SSOT |
| 2026-09-30 | Sprint 3 backend: marketplace, allocation, settlements, refills |
| 2026-09-30 | Sprint 4: pharmacist gate, H1 register, invoices, price checks, grievances, recall, privacy |
| 2026-09-30 | Sprint 5: cancellation, returns, refunds, credit notes, checkout disclosure, policies, handover code, ADR, licences, addresses |
| 2026-10-01 | Sprint 6: security fixes, deployability, catalogue import, final records, GST reports, saved Rx, cold chain, incidents |
| 2026-10-01 | Sprint 7: purchasing, goods receipt, stock adjustments, destruction register, counts, expiry watch, AWS SDK v3 |
| 2026-10-01 | Sprints 8–13: notifications, courier, e-invoicing, purchase returns, teleconsultation, payments, security review, languages, retention, riders, call tokens, GST lock, WhatsApp |
| 2026-10-02 | Sprint 27: partner stock import (MediVision preset, matching, apply to partner ledger) |
| 2026-10-02 | Sprint 28: admin onboards partners (licences, pharmacists, logins with forced password change) |
