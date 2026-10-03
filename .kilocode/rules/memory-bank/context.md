# Active Context

## Current state (2026-10-03)
The February Kilo Next.js prototype was replaced by the Dawabag v2 package
(built in a Claude chat, 30 Mar 2026). Sprints 1–43 are done (Sprint 14 video calls wired on web and mobile; Sprints 42–43 uncommitted) on branch
`claude/dawabag-pharmacy-status-0h7mr3`; beta now waits mainly on owner data, keys and
the lawyer/CA sign-off.

## Standing rules from the owner (2026-09-30)
- Server is the single source of truth: no local storage anywhere (see DECISIONS.md).
- Modular software: no monolithic HTML/single-file apps.

## Sprint 43 — quality sweep, change an order before packing, health data encrypted at rest (2026-10-03, uncommitted)

- DECISIONS rows 2026-10-03 "Buyers can lower quantities or remove lines before packing…" (developer's proposal — confirm), "Health details are encrypted at rest…", "Quality sweep of the website…". Migration 38 (`38_sprint43_order_edit_health_sealing.sql`; grants for dawabag_app / dawabag_maintenance). Gap analysis #17: health-profile encryption and edit-order built (min age per medicine still deferred).
- QA sweep: `docs/reviews/qa-sweep-sprint43.md` (findings table). Trial-like stack (separate DB, demo seed, APP_ENV=trial, API as dawabag_api) crawled per role (~300 pages: status, console, failed API calls, technical words, back, 390 px width) + customer walkthrough + recorded journeys (all roles, now running end to end on screen again). Fixed: "My orders" status = order page status (`GET /orders/my` adds `pharmacist_check`; `lib/orders/statusLabel.ts`; cards are links), admin dashboard no admin-only calls for pharmacist_rx, `POST /auth/refresh` web without cookie → 200 `data:null` (no 401 noise), payment options only when signed in, unpublished policy → neutral text, Settings plain words (no raw JSON / keys), `.overflow-x-auto { position: relative }` (sr-only escaped scrollers at 390 px), refund / credit-note reasons in words, "checks it before packing" everywhere, payment terms in words for credit only, medicine-info editor Back, order bill summary adds up (Items, GST, Delivery, Discount, wallet → Total; "Refunded since"; no raw payment id), one Back on the order page. Journeys updated for Sprints 30/39 (Authorise button, registrations, online-sale permit, licence fields, own queue card).
- Order edit (`services/orderEdit/`: rules.ts pure, edit.service.ts, editRefunds.ts): `POST /orders/:id/edit {lines:[{order_item_id, quantity}]}` buyer only, lower/remove only (raise → 422 ORDER_EDIT_INCREASE_NOT_SUPPORTED; additions deferred), while every shipment is `pending` and order confirmed/rx_pending/rx_verified/packing (409 ORDER_NOT_EDITABLE; ORDER_EDIT_WOULD_EMPTY; ORDER_EDIT_BELOW_MINIMUM trade minimums). Invoice untouched; credit note per seller (reason `order_edit`); `order_items.removed_qty` (trigger: only grows) + generated `supply_qty` used by pack lists, dispatch stock, H1 register, Rx gate, returns, pharmacist check, creditWholeShipment (remaining only), releaseOrderReservations; reservations back (own batch, partner_inventory; poi allocated_qty / line value reduced; seller with nothing left → shipment + poi cancelled); Rx ledger reversal; rx_pending with no Rx line left → packing (+ held capture). Money: buyer's share (after discount, delivery unchanged) via refund ledger source `order_edit` now (captured / wallet / credit), or `after_capture` for authorised-only payments (Razorpay captures in full; `refundEditsAfterCaptureTx` in capture.service), `not_needed` when the hold is released (cancellation). `order_edits` final except refund status. Order detail: `can_edit`, `edit_block_reason`, `edits[]`. Web: `components/orders/edit/` (EditOrderCard "Need less? / Change order", EditOrderDialog, OrderEditsCard), items show "(was N)".
- Health sealing (`services/healthProfile/sealing.ts`, `reseal.service.ts`): AES-256-GCM, HKDF from HEALTH_ENC_KEY, AAD table:id, blob `h1.<keyid>.<b64>`; HEALTH_ENC_KEY_PREVIOUS for rotation; start-up seals plain rows and re-seals old-key rows (audit `health_data_sealed`); `health_profiles.sealed`, `patients.health_sealed`, plain columns '[]' + CHECK; 500 HEALTH_DATA_UNREADABLE (plain message). Key: required with APP_ENV=production; trial.sh derives sha256("dawabag-health-key:"+DB_PASSWORD) when TRIAL_ENV lacks it; make-trial-env generates; staging derives from JWT_REFRESH_SECRET (warning + dashboard HEALTH_KEY_NOT_SET); dev/CI fixed development key. RUNBOOK §6 "Health data key" (rotation steps) + §8 item 10; compose api env.
- Tests: jest 86 suites / 658 (orderEdit rules, sealing, env); smoke 1–43 2157 checks (sprint43 55: test/sprint43/{fixtures,orderEdit,healthSealing}.mjs) with the API as dawabag_api; web tsc + lint + build pass; Playwright 148 passed / 4 skipped (S3 fake) incl. `orderEdit.spec.ts`, `qaSweep.spec.ts`; recorded journeys 108 steps all on screen.
- App (mobile, NOT done): show `supply_qty` (not `quantity`) per order line and "(was N)" when `removed_qty` > 0; optional "Change order" using `POST /orders/:id/edit` when `can_edit`; list `edits[]`; refund source `order_edit`, credit-note reason `order_edit`; `GET /orders/my` `pharmacist_check` for the list label; `GET /health-profile` may answer 500 HEALTH_DATA_UNREADABLE (show the message).

## Sprint 42 — frozen sale identity per shipment, two-step sign-in for staff and partners (2026-10-03, uncommitted)

- DECISIONS rows 2026-10-03 "Sale identity fixed per shipment at order placement…" and "Two-step sign-in (authenticator app)… BUILT, enforcement pending the owner's decision". Migration 37 (`37_sprint42_sale_identity_two_factor.sql`; grants for dawabag_app / dawabag_maintenance). Gap analysis #7 built; security review #16 mitigated (closed when set to required).
- Sale identity (handover D15 adapted): moment of sale = ORDER PLACEMENT (same tx as seller of record, stock, invoice number + amounts). `services/saleIdentity/` — rules.ts (channelFor trade→wholesale, lineForm 20/21/20B/21B by schedule_c_c1, lineLicence in date / longest valid, usedLicences, registrationSnapshot), record.service.ts `recordSaleIdentityTx` (replaces snapshotSellerLicences in orderPlacement), pharmacist.ts (registration as at the check). order_shipments: sale_channel retail|wholesale, sale_buyer_type, seller_drug_licences (all held), sale_licences (used), buyer_drug_licences (copy), pharmacist_registration (JSON: kind staff|partner, registration_no, state_council, valid_till, status, verified, recorded at_check|backfill), sale_identity_frozen_at, sale_identity_source sale|backfill. order_items: sale_licence_form (dl20/dl21/dl20b/dl21b), sale_licence_number, price_field (offer/ptr/pts/institutional). Triggers: order_shipments_identity_final (identity frozen; pharmacist_* + note + registration final once pharmacist_check released/rejected/not_recorded; registration fill-once), order_items_sale_identity_final, orders_buyer_licences_final; maintenance bypass as elsewhere. recordRelease / reject store the registration snapshot (holds may be overwritten by the decision). Readers: invoiceData (shipment snapshot; `sale` block; pharmacist council) + invoicePdf line "Retail sale / Sale by way of wholesale under Form … No. …"; H1 record uses the line's sale licence (fallback registerLicence); sales register adds sale_channel, sold_under_licences, buyer_licences, pharmacist_name/reg_no, sale_record. Backfill: seller licences from current register (partner verified party_licences / Dawabag business_licences), channel from KYC-approved trade type, lines by schedule_c_c1, registration from current rows — all marked backfill.
- Two-step sign-in: `services/twoFactor/` — totp.ts (RFC 4226/6238, base32, ±1 step, otpauth URI), keys.ts (TOTP_ENC_KEY → HKDF → AES-256-GCM secret bound to user id; HMAC-SHA-256 recovery hashes; fallback key from JWT_REFRESH_SECRET), policy.ts (roles super_admin/admin/pharmacist_rx/pharmacist_pack/partner — ALL partner logins; setting security.two_factor optional|required; signInStep, sessionMayContinue, mayDisable; 5 wrong → 15 min pause), challenge.ts (Redis single-use challenge 5 min / enrol 15 min, wrong counter 2fa_wrong:<id>), enrolment.service.ts (start/confirm/checkSecondStep with last_used_step replay guard/recovery once/disable/renew codes/overview/super-admin reset), signIn.service.ts sessionOrChallenge used by /auth/login, /auth/verify-otp, /auth/reset-password. controllers/twoFactor.controller.ts; routes /auth/2fa/{verify,enrol/start,enrol/confirm,status,disable,recovery-codes}, /admin/two-factor (+ /:userId/reset super_admin). JWT carries `mfa`; refresh refuses 401 TWO_FACTOR_SIGN_IN_REQUIRED when enrolled & !mfa or required & not enrolled; change-password keeps mfa (req.authMfa). Setting schema security.two_factor (super_admin PUT, audited). env.ts: TOTP_ENC_KEY required with APP_ENV=production, ≥32; warning otherwise. configWarnings TOTP_KEY_NOT_SET, TWO_FACTOR_NOT_REQUIRED (optional + unenrolled admins). QR server-side via qrcode → SVG data URL.
- Deploy: trial.sh derives TOTP_ENC_KEY = sha256("dawabag-totp-key:"+DB_PASSWORD) when TRIAL_ENV lacks it (existing TRIAL_ENV unchanged); make-trial-env.sh generates it; trial.env.example line; staging.env.example commented line; compose api `TOTP_ENC_KEY: ${TOTP_ENC_KEY:-}`. TRIAL.md + RUNBOOK §2 / §6 / §8 item 9. dev-env.sh unchanged (dev/CI use the derived key).
- Web: lib/auth/twoFactor.ts; components/twoFactor/ (SignInSecondStep, CodeStep, EnrolPanel, RecoveryCodes — copy/print only, nothing stored; PasswordAndCodeDialog, TwoFactorSettings, TwoFactorOverview); login page + ForgotPasswordForm handle the challenge; pages /staff/two-factor, /partner/two-factor, /admin/two-factor; nav "My two-step sign-in" (staff), "Two-step sign-in (all)" (admins), partner nav; Settings choice entry.
- Tests: jest 84 suites / 646 (totp RFC vectors, keys, policy, saleIdentity rules, env); smoke 1–42 2102 checks (sprint42 95: test/sprint42/{fixtures,saleIdentity,twoFactor,totp}.mjs — own RFC 6238 implementation self-checked) with the API as dawabag_api; web tsc + lint + build pass; Playwright 141 passed / 4 skipped (S3 fake) incl. e2e/tests/twoFactor.spec.ts; e2e cleanup resets security.two_factor to optional.
- App (mobile, Sprint 42 DONE, uncommitted): staff/partner two-step sign-in. models/two_factor.dart (TwoFactorChallenge.tryParse, TwoFactorEnrolment, TwoFactorStatus, kTwoFactorRoles, recoveryCodesWarning); services/two_factor_api.dart (verify, enrol start/confirm, status, recovery-codes, disable; error codes); AuthState.challenge (memory only) + AuthState.notice; login / verify-otp / reset-password hand the challenge to /auth/two-factor (screens/auth/two_factor/: TwoFactorScreen, CodeStep with "Use a recovery code"); widgets/two_factor/ (EnrolPanel — no flutter_svg, so the key in groups + "Open authenticator app" via url_launcher otpauth:// + Copy key; RecoveryCodesView shown once, copy allowed, never stored; AuthenticatorCodeField; TwoFactorMessage); /account/two-factor settings (status, new recovery codes, switch off when may_disable; PasswordAndCodeDialog), entry in Account for kTwoFactorRoles and on AdminScreen. ApiService.onSignInRequired: /auth/refresh 401 TWO_FACTOR_SIGN_IN_REQUIRED → session cleared, router goes to /auth/login with the message. Errors: 400 wrong (stay), 429 paused (message, Verify off), 401 challenge expired (back to sign-in with message), 409 key changed (message). config/sign_in_home.dart shared home routing. Buyers unchanged. test/sprint42_two_factor_test.dart (12: code, recovery, enrol not stored, expired, paused, key changed, buyer, reset challenge, refresh, settings).

## Sprint 41 — launch readiness: security review 35–40, API as its own DB login, backup chain heads (2026-10-03, uncommitted)

- DECISIONS rows 2026-10-03 "The API runs as its own restricted database login…", "Security review of Sprints 35–40…", "Backups carry the chain heads; restore drill…", "Approved cold-chain couriers…"; Sprint 40 chain row corrected (integrity.chain_start = operator SQL, not a setting). Migration 36 (`36_sprint41_launch_readiness.sql`: setting delivery.cold_chain_couriers, REVOKE CREATE ON SCHEMA public FROM PUBLIC).
- Review: `docs/security/review-sprint35-40.md` — 0 high, 5 medium fixed (OTP wrong codes counted only on reset; no per-mobile send limit; held-payment capture crossing a cancellation / double capture; API as DB owner; chain heads only inside the DB), 10 low fixed, 6 low left (SMS-only reset for admins → owner to decide 2FA; codes not purpose-scoped; keys survive issuer deactivation; refused-key audit rows; chain_start operator-only; in-memory IP limiters).
- OTP: `services/otp/otp.service.ts` (crypto codes; takeOtpSendSlot: OTP_SEND_MIN_GAP_SECONDS 30, OTP_SENDS_PER_HOUR 5 → 429 OTP_SEND_LIMIT, counted before account lookup; checkOtp: otp_wrong:<mobile> across verify-otp and reset-password, 5th wrong deletes the code). redis.ts storeOTP/verifyOTP removed. reset-password: inactive account = wrong code. dev-env.sh sets generous OTP limits.
- Capture: `captureHeldPayment` runs under the ORDER row lock (cancelOrder locks it first): readiness → Razorpay capture (20 s timeout) → `applyCaptureTx` in one transaction; `afterCapture` after commit. Fake gateway `razorpay.captureDelayMs` for the race test.
- DB login: `backend/src/db/appLogin.ts` ensureAppLogin (run by migrate.ts when DB_APP_LOGIN set): LOGIN, no super/createrole/createdb/bypassrls, member of dawabag_app only (others revoked), SCRAM verifier, re-grants privileges + default privileges, purge function owner → dawabag_maintenance (repairs a --no-privileges restore), creates NOLOGIN roles if missing. loginPosture() at start-up (log; production refuses if not restricted) and config warning DB_LOGIN_NOT_RESTRICTED. compose: new one-shot `migrate` service (owner, DB_APP_LOGIN/DB_APP_PASSWORD, env_file), `api` uses DB_USER=${DB_APP_LOGIN:-dawabag_api}, DB_PASSWORD=${DB_APP_PASSWORD}, RUN_MIGRATIONS=false, depends on migrate completed. trial.sh derives DB_APP_PASSWORD = sha256("dawabag-api-login:"+DB_PASSWORD)[0:48] when the env file lacks it; seed/unseed via `dc run --rm --no-deps migrate`; new `dblogin`. make-trial-env.sh generates DB_APP_PASSWORD; deploy-trial.yml: missing → ::notice, present → ≥16 printable, ≠ DB_PASSWORD. CI staging job seds DB_APP_PASSWORD. Dev/CI: dev-env.sh DB_APP_LOGIN=dawabag_api / DB_APP_PASSWORD=dawabag_api_dev_only_0000; dev-up.sh and test startApi run the API as it (tests keep owner DATABASE_URL).
- Backups: `deploy/staging/backup/heads.sql` (audit head, H1 heads per register, last recorded chain_heads, chain_start) read before pg_dump → s3.mjs dump metadata (chain-audit-head, chain-h1-registers, chain-heads-sha256) + `<key>.heads.json`; `s3.mjs heads <key>` (checksum-checked); restore.sh verifies every head in the restored DB (RESTORE FAILED otherwise; pre-Sprint-41 backups warn). RUNBOOK §6 "Restore drill" incl. chain_start SQL with audit entry.
- Small fixes: errorHandler redacts prescriber/patient address, reg nos, supplier licence/bill; GDP partner disposition checks ownership before locking (404); JSON 1 MB (JSON_BODY_LIMIT) except /partner-feed 10 MB; chain check one at a time (Redis lock, 409 CHAIN_CHECK_RUNNING); live-feed check update filtered by partner_id; self-inspection people list no mobiles; demo removal clears job_runs.triggered_by.
- URS gaps (#17): approved cold-chain couriers built (setting text list, checked at own + partner dispatch, 409 COLD_CHAIN_COURIER_NOT_APPROVED, dashboard warning COLD_CHAIN_COURIERS_NOT_SET; web Settings entry). Deferred: min age per medicine (needs DOB capture), health_profiles column encryption (KMS decision), edit order before packing (own sprint). DPDP Consent Manager not started (readiness noted). Not built from Sprint 39 batch: #7 frozen sale identity per shipment → Sprint 42.
- Verified locally: docker compose stack (postgres+redis+migrate+api) with an old-style TRIAL_ENV (derived password): API logs "connected as dawabag_api (restricted API login)", owner password absent from the API container, demo seed/unseed via migrate, 7 jobs succeed as the restricted login; backup + restore drill against MinIO (heads verified; tampered heads.json → RESTORE FAILED).
- Tests: jest 80 suites / 602; smoke 1–41 2007 checks (sprint41 52) with the API and every spawned test API as dawabag_api, no permission errors; web tsc + lint + build pass; Playwright 139 passed / 4 skipped (same skips as Sprint 40; API as dawabag_api, S3 fake).
- App (mobile, NOT done): send-otp 429 OTP_SEND_LIMIT (show server message, keep the code step / allow retry after the wait); verify-otp / reset-password 400 "Too many wrong codes. Ask for a new code." No other API change.

## Sprint 40 — GDP records + excursion holds, product class / new drugs, mock recall drills, self-inspections, chain heads (2026-10-03, uncommitted)

- DECISIONS rows 2026-10-03 "GDP records per batch…", "Product class and new-drug flag…", "Mock recall drill…", "Self-inspection register…", "Nightly chain check with recorded heads…", "Sign-in codes when SMS is not configured…". Migration 35 (`35_sprint40_gdp_product_class_drills_inspections.sql`).
- GDP: append-only `gdp_records` (own batch or partner batch; received/storage_check/temperature_reading/excursion/excursion_disposition/transfer/dispatch) + `gdp_status` (ok/on_hold/quarantined/destroyed) on inventory_batches and partner_inventory, set only by trigger (guard refuses direct UPDATE). Cold-chain reading outside 2–8 °C → excursion → on_hold. Held batches out of sellable stock (partnerStock.ts, allocation, orderPlacement low-stock, productAdmin, coupon route); pack/dispatch guard `services/gdp/guard.ts` 409 GDP_HOLD. Dispatch at bad temp: excursion logged first (own tx) then 409 COLD_CHAIN_EXCURSION (handover.service hard refusal kept as backstop). GRN writes "received" with storage condition. Disposition: Dawabag pharmacist_rx with valid registration (own batches only); partner's own vendor pharmacist (partner batches); release (≥20 chars) / quarantine (still held) / destroy (Dawabag: damaged write-off for second person → destruction register). API /gdp/* and /partner/gdp/*; alert gdp_excursion. Web Staff → GDP records, GDP excursions; Partner → GDP records.
- Product class: products.product_class drug|device|cosmetic|ayush|general (backfill: drug unless OTC/non-scheduled category clearly cosmetic/general, or AYUSH-type), is_new_drug + new_drug_confirmation/by/at. DB CHECKs products_device_not_permitted, products_new_drug_confirmed; guard trigger restricts on reclassify to device / newly flagged new drug; status log keeps new_drug_confirmation. Online-sale input new_drug_confirmation (≥20). Forms: admin product, new-product draft, catalogue file columns "Product class"/"New drug", admin list filter ?product_class=&new_drug=1. Sprint 39 stand-ins skip devices/new drugs.
- Mock recall drill: shared trace `services/recall/trace.ts` (recall.service uses it); `recall_drills` final after trace, one close-out; PDF on demand (pdfkit, never stored); API /recall-drills (admins); web Admin → Recall drills (+ printable report).
- Self-inspection: templates (seeded monthly checklist), inspections + results append-only, corrective_actions (status only; closed final) + corrective_action_events history (trigger); job self_inspection_watch (08:10) alerts once (self_inspection_overdue). API /self-inspections; web Staff → Self-inspections (+ Checklists for admins).
- Chain heads: job chain_verify (02:20) walks H1 + audit chains, checks previous recorded head still there (truncation), appends `chain_heads`, alerts chain_break; setting integrity.chain_start (documented restore / test DB only). API GET /admin/chain-heads, POST /admin/chain-heads/verify; Admin → Record integrity panel. errorHandler: our own trigger check_violation messages now returned as 409 with the message.
- Leftovers: templates/03 sheet 4 supplier_name / supplier_licence_no / supplier_invoice_no / supplier_invoice_date (mapping test); partner page Batch suppliers (POST /partner/batch-provenance/:inventoryId, once, 409 PROVENANCE_ALREADY_RECORDED).
- SMS add-on: no MSG91_AUTH_KEY → POST /auth/send-otp 503 SMS_NOT_CONFIGURED, same message for every number; web sign-in/forgot-password show it; GET /admin/config-warnings + dashboard banner (also SMS_OTP_TEMPLATE_MISSING).
- Tests: jest 590 (gdp, productClass, selfInspection, trace rules; template supplier mapping); smoke 1–40 1955 checks (sprint40 123; sprint6 uses test/support/gdpHolds.mjs to release the excursion its >8 °C dispatch now logs); Playwright 139 passed / 4 skipped (with the S3 fake) incl. e2e/tests/sprint40.spec.ts (excursion queue, drill page, self-inspection, SMS notice).
- App (mobile, NOT done): handle 503 SMS_NOT_CONFIGURED on send-otp (login by code + forgot password) by showing the server message instead of the code step; staff-only notification types gdp_excursion, self_inspection_overdue, chain_break (fall back gracefully); partner app none.

- App (Sprint 40): send-otp 503 SMS_NOT_CONFIGURED → server sentence shown, back to password sign-in (login, OTP resend, forgot password); staff-only notification types gdp_excursion, self_inspection_overdue, chain_break. flutter 262 passed.
- Stock connector (tools/stock-connector, docs/stock-connector.md): PowerShell 5.1 module + scheduled task on the partner's Windows server; uploads new MediVision exports to /partner-feed/:id/stock-snapshot; stateless (whoami), key in Windows Credential Manager, Event Log only; not yet run on Windows. MediVision Platinum runs on Nootan's LAN server 192.168.1.7 via Allied's app server (port 54322); database not reachable directly — owner asking Allied for scheduled export / read-only DB login / API.

## Sprint 39 — Rx before payment + authorise-then-capture, online-sale status, pharmacist registrations, partner provenance (2026-10-03, uncommitted)

- Owner answers CONFIRMED 2026-10-03 built (DECISIONS rows 2026-10-03 "Prescription before payment…", "Online-sale status…", "Pharmacist registration validity…", "Partner batch provenance…"). Migration 34 (`34_sprint39_rx_capture_online_status_registrations.sql`).
- Rx before payment: POST /orders needs `prescription_id` for Rx lines (422 PRESCRIPTION_REQUIRED); /payments/create-order and /payments/demo re-check (refill orders). Rx orders authorised only (Razorpay payment.capture=manual, manual_expiry_period 7200); captured by captureHeldPayment when no Rx line waits and every Rx shipment is released (verify / apply / pharmacist check / partner check). Cancellation / refusal / timeout → payments.status 'released' (no Razorpay void exists; hold returns at window end). Mixed carts: one authorisation, full capture after the check. Watch job payment_hold_watch (*/15): alert 48 h, cancel+release 72 h (setting payments.rx_authorisation), retry failed captures, gateway-expired hold → cancel. Pack/dispatch refuse PAYMENT_NOT_CAPTURED. Webhook payment.authorized. Demo simulates. services/payments/rxHold/, services/prescriptions/requirement.service.ts.
- Online-sale status: products.online_sale_status permitted|restricted|prohibited (+ref, ref_date, reason, set_by/at), product_online_status_log (DB trigger, append-only), CHECK X/NDPS never permitted, schedule→X/NDPS auto-prohibits. New products restricted; backfill live→permitted. Only pharmacist_rx (valid registration) allows with dated ref; admins/pharmacists stop with reason; partners with listings notified. Buyer paths: SELLABLE_SQL/onlineSellableSql, search, didYouMean, product detail/delivery, cart (NOT_FOR_ONLINE_SALE), orderPlacement, refills, categories. API /online-sale/products (+bulk, log); draft approve `online_sale`. Web: Staff → Online-sale status; badge in Admin → Products; step in New products to complete.
- Pharmacist registrations: pharmacist_registrations (staff) + vendor_pharmacists council/valid_till/registration_status/verified_*; gates: Rx verify, order check, partner release, medicine-info approval, online-sale permit (PHARMACIST_REGISTRATION_INVALID). Pre-Sprint-39 pharmacists carried over "not yet recorded" (allowed + warning). API /pharmacist-registrations (admin GET, PUT staff/:userId, PUT partner/:id; GET /me). Job pharmacist_registration_alerts (30/0 days). Web: Admin → Pharmacist registrations, staff warning banner, partner check dialog notes, partner form council/valid-till.
- Partner provenance: partner_batch_provenance (immutable), from file columns / portal editor / feed JSON (supplier_name, supplier_licence, supplier_invoice_no, supplier_invoice_date); setting partner_stock.provenance_required (off) → required for H1 + cold chain. API GET /partner-provenance (admin), GET /partner/batch-provenance. Web: Admin → Partner batch suppliers; partner stock editor fields.
- Tests: jest 575 (+ rxHold, onlineSale, pharmacistRegistration, partnerProvenance rules/guards/parsing); smoke 1–39 1832 checks (sprint39 127); Playwright 135 passed / 4 skipped (with the S3 fake). Earlier suites use test/support/sprint39Fixtures.mjs stand-ins (fixture products permitted, fixture pharmacists verified, prescription added when checkout asks) via the shared call().
- App (mobile, NOT done — instructions in the Sprint 39 hand-over): send prescription_id with POST /orders, show 422 PRESCRIPTION_REQUIRED, handle payment_status 'authorized' and charge_note, order `payment` block, new notification types payment_authorised / payment_hold_expiring / pharmacist_registration_expiring / online_sale_status_changed, NOT_FOR_ONLINE_SALE in cart.

- App (Sprint 39): prescription_id sent with POST /orders (prescription chosen before payment; 422 PRESCRIPTION_REQUIRED returns to the prescription step); 'You'll only be charged after our pharmacist checks your prescription' + held/charged/released payment card; NOT_FOR_ONLINE_SALE cart lines block checkout; product 404 → 'Not available online'; 4 new notification types. flutter 252 passed, analyze clean.

## Sprint 38 — registers and integrity (2026-10-03)

- Source: external design handover compared in docs/reviews/handover-gap-analysis-2026-10-03.md. Owner rulings CONFIRMED 2026-10-03: marketplace stays (handover "seller-only" rejected); no legal-opinion lock (partners invoice with their own pharmacist); build handover ideas that strengthen Dawabag; emergency stop added. Owner answers for Sprint 39 (not built yet): pay-first + Rx upload before payment + authorise-then-capture; new products restricted by default; partner batch provenance optional then required for H1/cold-chain. Rx retention 3 years after last dispense CONFIRMED.
- Migration 33: roles dawabag_maintenance (trigger bypass works only as that role: SECURITY DEFINER fn or SET ROLE) and dawabag_app (API privileges). Test clean-ups use "SET ROLE dawabag_maintenance; SET dawabag.maintenance = 'on'". Deploy TODO: run the API as a non-owner login in dawabag_app (RUNBOOK §6).
- H1 register: prescriber_address required at verify; missing detail → 409 H1_REGISTER_INCOMPLETE; register per seller licence (register_key dawabag:<LIC> / partner:<id>:<LIC>); gapless entry_no + prev_hash/row_hash sealed at commit under advisory lock; canonical text utils/hashChain.ts = SQL dawabag_h1_canonical; old rows chain_legacy. Pharmacist completes old prescriptions: /fulfilment/prescriptions/h1-incomplete. Partner /partner/h1-register (+csv, verify); admin /admin/integrity.
- Audit log: global hash chain sealed at commit; GET /admin/audit-chain/verify; writeAudit() retries then 503 AUDIT_WRITE_FAILED.
- Prescriptions frozen once verified; rx_dispense_ledger + view prescription_item_balances replace dispensed_qty; retain_until = last dispense + 3 years; purge only if retention.prescription_purge=true.
- Emergency stop: GET /sales-status (public); /admin/emergency-stop (super_admin, typed PAUSE/RESUME, audited). Paused: Rx cart/checkout/payment → 409 RX_SALES_PAUSED; paid orders held at dispatch.
- Extras: no referral codes for doctors; checkout/snapshot consistent lock order + retry on 40P01/40001 (fixes Sprint 37 known issue).
- Follow-ups: nightly chain-verify job; note latest chain hash with monthly backup; API as dawabag_app login.
- Tests: jest 539; smoke 1–38 1703 checks; Playwright 131 passed / 7 skipped.
- App: sales-status banner (home, cart, checkout, Rx product pages; not for B2B/doctor), 409 RX_SALES_PAUSED shown plainly, paused cart lines block checkout, no referral field for doc_hospital. flutter 233 passed, analyze clean. App has no pharmacist verify screen.

## Sprint 37 — live stock feed from the partner's billing software (2026-10-03)

- Owner CONFIRMED 2026-10-03: feed quantity changes of linked+listed products apply automatically; new products / price-MRP / other non-quantity changes wait for a person; waiting items flagged URGENT (blinking badge + once-only in-app/email to partner owner + admins). Live mode opt-in per partner (admin).
- MediVision Gold's data files are encrypted (not readable; we do not break it). Primary path: Allied enables a scheduled stock-report export (Excel/CSV ~5 min) that a small LAN connector uploads. Owner is asking Allied (2026-10-03). JSON also supported.
- Migration 32: `partner_stock_feeds` (mode manual|live, stale_after_minutes 15, stale_policy hide|margin, stale_margin_pct 50, billing_grace_minutes 0, last sequence/taken_at/sha256), `partner_feed_checks` (new_product, new_listing, cold_chain_batch, price_change, expiry_change, short_for_orders), feed columns on partner_stock_imports and partner_inventory, SQL `dawabag_partner_sellable()` used by stock/partnerStock.ts and allocation.
- API: `POST /partner-feed/:id/stock-snapshot` (multipart file or JSON; order by X-Snapshot-Taken-At; idempotent by SHA-256); `/stock-files` behaves the same for a live partner; whoami adds stock_feed. 120 snapshots/key/hour. Partner `/partner/stock-feed` + checks accept/link/request-product/dismiss; admin `/admin/partners/:id/stock-feed`, `/admin/stock-feeds/*`. Job `live_stock_feed_watch` (*/5). Notification types stock_feed_checks, stock_feed_stale (app knows them).
- Rules: full snapshot (absent linked batch → 0); expired/short-dated/recalled → 0; earlier expiry adopted, later waits; first price adopted, change waits; new cold-chain batch waits. No drift: shelf = snapshot − dispatched after snapshot (− grace), never below reserved ("billed = dispatched", proposed). Live mode refuses the portal stock editor and file apply. Stale → hide (default) or margin; alert once.
- Web: `.urgent-badge` (white on red ≥6.5:1, 2 s blink, static under prefers-reduced-motion) in partner and admin header/menu/pages.
- Known: a snapshot locks the partner's batches; a simultaneous checkout with two lines from that partner could hit a deadlock error (follow-up: lock ordering / retry).
- Tests: jest 515; smoke 1–37 1622 checks; Playwright 128 passed / 7 skipped; flutter 224 passed, analyze clean.
- Proposals awaiting owner: auto/check split details, "billed = dispatched", staleness default hide after 15 min.

## Sprint 36 — merge lists, partner stock-feed keys, medicine-info four-eyes, app pharmacist check (2026-10-03)

- Migration 31 (`31_sprint36_merge_feed_keys_four_eyes.sql`).
- Category / HSN merge: `merged_into` on both lists; the products trigger follows merges. `POST /catalogue-lists/categories/:id/merge` and `POST /catalogue-lists/hsn-codes/:code/merge` (HSN only while unsold and with the same GST rate, C-30/C-31). Admin web "Merge into…".
- Partner stock-feed API keys: `partner_api_keys` (prefix + SHA-256 only, shown once, constant-time check), `vendor_users.is_owner`, `partner_stock_imports.api_key_id`. Machine endpoints `/partner-feed/:partnerId/{stock-files,whoami}`; an upload creates a DRAFT through the same `createImport` (a person applies it in the portal). 20 uploads/key/hour (`STOCK_FEED_MAX_PER_HOUR`). Query strings on /partner-feed are never logged. Doc: `docs/partner-stock-api.md`.
- Medicine information four-eyes (owner confirmed): `author_ids`, DB check `product_info_four_eyes`; an author cannot approve; `GET /medicines/info-review/returned`; web `/staff/medicine-info-approvals`.
- Refused orders: buyers see `cancellation_reason` (owner confirmed); hold notes (`pharmacist_check_note`) stay staff-only. Web `RefusedOrderCard`.
- App (commit 8730466): pharmacist check step + held/refused notices, in-app Notifications screen (GET /notifications/my), all 36 notification types routed incl. `order_on_hold`, neutral OTP wording, trust strip link.
- Owner confirmed 2026-10-03: partner's own pharmacist releases partner shipments; four-eyes for medicine info; refusal reason visible to buyers. Razorpay test payment: owner will UAT later.
- Tests: jest 488, smoke 1–36 1545 checks, Playwright 125 passed / 7 skipped, flutter 224 passed, analyze clean.

## Sprint 35 — app rebrand + JPEG uploads (mobile only, 2026-10-02, uncommitted)
- **DAWA BAG brand** (DECISIONS "Adopt the DAWA BAG brand"): `mobile/assets/brand/` — logo.png and wordmark.png
  (1x/2x/3x) rendered from the owner's vector PDF; `source/logo.svg` + `source/make_brand_assets.py` (pymupdf + pillow)
  remake everything; provenance in `assets/brand/README.md`. Launcher icon = the logo's bag shape only (Android
  legacy mipmaps, adaptive + monochrome `mipmap-anydpi-v26`, iOS AppIcon set); splash: Android 12+ `values-v31` /
  `values-night-v31` (splash_mark), older `launch_background` with the logo, iOS LaunchImage 200 pt. App name
  "DAWA BAG" (Android label, iOS display name, MaterialApp title). The mock-ups' illustration is NOT used (licence unknown).
- **Theme** (`config/theme.dart`): tokens `brandTealLogo #0397A6` (logo / large only, 3.5:1), `brandTeal #027A86`
  (primary, buttons, small text — 5.1:1 with white), `brandTeal700 #015F68`, `brandTeal50/100`, `brandLeaf #87A959`
  (decorative only), `brandLeafDark #4E6B2C` (readable green, discounts), `brandGrey #565655`; dark theme primary
  `#5CC8D2` on-primary `#00363C`. Pill buttons (StadiumBorder) and pill fields (radius 28), labels always visible;
  `lightTheme(googleFonts: false)` for offline widget tests. All `brandGreen*` uses renamed to the teal tokens.
- **Screens**: `/welcome` (new initial route; signed-in sessions are redirected to `/`; headline "Medicines delivered to
  your door, checked by a pharmacist" — no "fastest" claim, C-17), sign-in (password or OTP via /auth/send-otp →
  OTP screen; labels above fields; "Forgot password?"), `/auth/forgot-password` (mobile → OTP → new password twice →
  `POST /auth/reset-password {mobile, otp, new_password}`), sign-up restyled (logo, brand backdrop, labels above,
  password field now checks the server's password rules). Shared widgets in `widgets/brand/` (BrandLogo,
  BrandBackdrop, LabeledField, AuthPage).
- **OPEN (backend):** `POST /auth/reset-password` does not exist yet. Until it does, the app shows "Sign in with the
  OTP instead" (the OTP already sent still works with /auth/verify-otp). The server should check the OTP, the
  password policy, reset lockout and end other sessions (password_changed_at, C-44).
- **JPEG uploads:** `services/upload_file.dart` types every upload by its first bytes (JPEG / PNG / PDF; HEIC/HEIF
  refused with a plain message) and fixes the file name; `ApiService.uploadMultipart` uses it for prescriptions
  (previously sent as application/octet-stream — would have been refused by the Sprint 34 server check), licence
  copies and KYC documents; KYC files are checked when picked. `services/photo_picker.dart`: image_picker with
  imageQuality 85, max 2400 px (re-encodes iPhone HEIC as JPEG).
- Tests: +41 (sprint35_brand_contrast, sprint35_auth_screens, sprint35_jpeg_uploads) — flutter test 195 passed;
  flutter analyze 13 infos (all existing, no errors/warnings). Not verified on a device: launcher icon / splash
  rendering, image_picker's HEIC → JPEG re-encode on a real iPhone / Android gallery.

## Sprint 35 — pharmacist check on every order; DAWA BAG rebrand (web) (backend + web, 2026-10-02, uncommitted)
- Owner decisions (DECISIONS rows 2026-10-02): every order / shipment is checked and released by a registered
  pharmacist before packing or dispatch (C-08); DAWA | BAG logo applied. Developer's recommendation recorded:
  partner shipments are released by the PARTNER's own registered pharmacist (vendor_pharmacists), Dawabag's
  pharmacist releases Dawabag's own — owner may override. Forgot password by OTP added (coordinator scope).
- DB `30_sprint35_pharmacist_check.sql`: `order_shipments.pharmacist_check` pending | held | released | rejected |
  not_recorded (+ checked_by, checked_at, pharmacist_name, pharmacist_reg_no, vendor_pharmacist_id, note; CHECK:
  released ⇒ name + reg no + time; held / rejected ⇒ reason ≥ 5). Backfill: shipments still 'pending' → pending,
  everything else → not_recorded (may still be dispatched). Trust page 'pharmacist-checked' v2 "Every order is
  checked by a pharmacist" inserted ONLY if v1 is still the untouched seed (md5 of summary + body) and no v2+.
- Backend `services/pharmacistCheck/`: rules.ts (pure: mayPack = released; mayDispatch = released | not_recorded;
  canDecide; reasons; orderCheckState; abuseSignals = qty at max_qty_per_order, habit forming from approved
  medicine info, Schedule H1 / X / NDPS, same product ≥1 unit in the buyer's other orders in 30 days),
  check.service.ts (checkQueue: Dawabag shipments pending/held of orders confirmed | packing | rx_verified, held
  last; orderCheckDetail; decide() release / hold / reject — reject = cancelOrder(staff) → refund (C-37), then
  marks the shipment rejected; hold queues notification `order_on_hold`; audit pharmacist_check_released / _held /
  _rejected with name + reg no + via; releaseOwnAfterPrescription called inside verifyPrescription and
  applyPrescriptionToOrder → the Rx review IS the check, response `shipments_released`), partner.service.ts
  (partner chooses an active vendor_pharmacist of ITS vendor; order rx_pending → 409 "Waiting for Dawabag's
  pharmacist"). Gates: fulfilment.service pack (mayPack) + dispatch (mayDispatch), partnerFulfilment dispatch
  (plain partner message). Pack queue now includes unreleased shipments (pharmacist fields; released first).
  API: GET /fulfilment/queue?stage=check (pharmacist_rx), GET /fulfilment/checks/:orderId (rx/admin),
  POST /fulfilment/shipments/:id/check {decision, reason} (pharmacist_rx with reg no), GET /partner/pharmacists,
  POST /partner/shipments/:id/check {decision, vendor_pharmacist_id, reason}. Order detail: shipments[].
  pharmacist_check / name / reg_no / checked_at (+ note for staff only; held hides the name from buyers) and
  order-level `pharmacist_check`. Invoice PDF: "Checked by pharmacist <name>, Reg. no. <x>" (tax invoices only).
  Admin stats `waiting_pharmacist_check`.
- Password reset: POST /auth/reset-password {mobile, otp, new_password} (controllers/passwordReset.controller.ts;
  passwordPolicy first, then OTP; 5 wrong codes delete the OTP (`otp_wrong:<mobile>` 15 min); same answer for an
  unknown mobile; sets password_changed_at (ends every session), clears lock + must_change_password, marks mobile
  verified, audit password_reset_by_otp, issues a session). /auth/send-otp now answers 200 with the same message
  for unregistered mobiles (SMS sent after the response, crypto.randomInt). OTPs are not purpose-scoped (one
  otp:<mobile> key for sign-in, verify and reset).
- Brand: `frontend-web/public/brand/` (dawabag-logo.svg = PDF conversion with tagline as paths, dawabag-wordmark.svg
  without tagline, dawabag-mark.svg DERIVED bag icon (logo handle + plain two-colour body), PNG sizes, apple-touch,
  icon-192/512 + maskable, README with provenance), `public/favicon.ico`, `public/manifest.webmanifest`; web
  Dockerfile now copies public/. `backend/assets/brand/` PNGs for pdfkit (utils/brand.ts; backend Dockerfile copies
  assets). Logo on Dawabag invoices / credit notes and e-prescriptions; partner invoices get only "Ordered through
  the DAWA BAG platform" (C-05). Emails: white header with the logo linked from PUBLIC_WEB_URL/brand/
  dawabag-logo-email.png + tagline. Razorpay theme #027B87.
- Theme: Tailwind `brand` = teal (500 #0397A6 logo/large only, 3.5:1 with white; 600 #027B87 5.0:1 buttons/links;
  700 #026D78 6.1:1; 800 #025B64), `accent` = green (500 #87A959 decoration only 2.7:1; 700 #586F39 5.6:1 text),
  `ink` #565655; CSS variables --brand-teal(-strong/-deep) --brand-green(-strong) --brand-grey. Pill .btn-primary /
  .btn-outline / .input (textarea.input rounded-2xl), focus rings brand-500. BrandLogo (wordmark | full | mark,
  next/image unoptimized) in Header, footer (+ tagline), Admin / Doctor / Partner shells; home hero tagline;
  TrustStrip "Every order, before packing" → /trust/pharmacist-checked; metadata title "DAWA BAG — Online Pharmacy",
  no "fast delivery" claim (C-17).
- Auth (owner's mock): AuthShell (full logo + tagline centred, heading, rounded card), IconField (label above, pill
  with icon, +91 prefix); login = Password | One-time code (send-otp → verify-otp), "Forgot password?" →
  /auth/forgot-password (ForgotPasswordForm: mobile → code + new password twice → signed in); register uses
  AuthShell; placeholders 9876543210 / •••••••• kept for tests.
- Staff web: one "Pharmacist check" tab (PharmacistCheckTab = RxQueue "Prescription orders" + CheckQueue "Orders to
  check before packing"; CheckDialog: health note, lines, signals, reason, Release for packing / Put on hold / Do not
  supply (confirm twice)); RxReviewDialog shows OrderCheckSignals + "verifying also releases"; pack card disabled
  with the reason (data-testid pack-blocked) and "Checked by pharmacist …". Partner portal: "Pharmacist check"
  button + PartnerCheckDialog (choose pharmacist, confirm box, reason), Dispatch disabled until released.
  Buyer: lib/orders/timeline.ts — "Pharmacist check" step on every order (Rx: "Prescription submitted" then the
  check), "Checked by pharmacist <name>, Reg. no. <x>" per released shipment, status chip "Pharmacist check" /
  "On hold — pharmacist will call"; 'packing' label now "Being prepared".
- Tests: jest 59 suites / 476 (+ pharmacistCheck/rules.test, passwordReset.test); `test/sprint35.smoke.mjs`
  (67 checks: non-Rx blocked then hold/release/pack, credit order queued at placement, Rx single check, reject →
  cancel + refund, partner pharmacist hold/release/dispatch, partner waits for Rx, trust page, password reset) in
  test:smoke. Older suites release first via `test/support/pharmacistCheck.mjs` (releaseForPacking through the API
  where a pharmacist login exists — S4/S5/S6; releaseInDb for S3/S5 partner, S8, S9, S13); S9 counts PDF images
  (logo + QR); S33 trust text updated; S4 checks the Rx review releases the shipment. Playwright:
  pharmacistCheck.spec (queue, hold, blocked pack button, release, buyer timeline), forgotPassword.spec (logo,
  OTP sign-in, reset), a11y adds /auth/forgot-password and /trust/pharmacist-checked; journeys pharmacist (OTC order
  check) and partner (partner pharmacist release) updated (not re-recorded). Full runs: smoke all green;
  Playwright 120 passed, 6 skipped (S3-upload / desktop-only skips); web tsc + lint + build pass.
  Before/after screenshots (home, product, login, checkout, admin × phone / desktop) were taken outside the repo.

  type order_on_hold, /auth/send-otp no longer 404s for unknown mobiles, brand assets in public/brand.
- DLT: new SMS type `order_on_hold` needs a registered template (sms.dlt_templates) before SMS goes out.

## Sprint 34 — security review 25–33, Schedule C/C1, retention, list enforcement (backend + web, 2026-10-02, uncommitted)
- A. Security review of Sprints 25–33: `docs/security/review-sprint25-33.md` (1 High, 6 Medium, 10 Low; all High/Medium
  and 7 Lows fixed, 3 Lows left with reasons). High: licence scans IDOR — `register.service` ownership check matched
  any buyer to any buyer's (and partner to partner's) licence (`!==`/`&&` on NULLs); now `ownsLicence()`. Medium:
  password change now ends every other session (`users.password_changed_at` from the API clock; `utils/jwt
  issuedBeforePasswordChange` in authenticate / optionalAuth / refresh); xlsx zip bombs (`utils/zipGuard.ts`
  before every exceljs load: ≤ 2,000 parts, ≤ 60 MB unpacked, each part inflated with maxOutputLength); HTML
  ".xls" parser rewritten linear (old lazy regexes were quadratic); CSV / sheet rows capped while parsing;
  uploads typed by magic bytes (`utils/documentCheck.ts`: prescriptions, licence scans, KYC documents);
  pharmacist health note only for orders still being checked / packed (409 otherwise). Lows fixed: recursive
  error-log redaction, login timing for unknown mobiles (dummy bcrypt), upload rate limit (`UPLOAD_RATE_LIMIT_MAX`,
  default 40 / 15 min; dev-env 5,000), search page/limit/q sanitised, `sqlRef()` guard on the stock SQL
  builders (constants only — verified no user input), licence work-list filter bound, stock-import mapping /
  cancel audited. Left: change-password wrong-current not counted for lockout; same pharmacist may write and
  approve medicine info; no search-specific limiter (global covers).
- B. Schedule C / C1 (DECISIONS row): `products.schedule_c_c1` (migration `29_sprint34_schedule_c_retention_lists.sql`,
  NOT NULL default FALSE = not marked; set by the pharmacist, never guessed). `stock/sellingRights.ts`
  `requiredForm` / `requiredRegisterType`: C/C1 → Form 21 (retail) / 21B (trade), others → 20 / 20B; SQL builders
  now take the product (`partnerMaySupplySql(v, kind, productExpr)`, `dawabagMaySupplySql(kind, productExpr)`);
  allocation checks own stock per line. Selling-rights status adds `dawabag_forms`, per-partner `forms` and
  warnings `dawabag_no_form_20/21/20b/21b`. Editable: admin product form + "New products to complete"
  (`components/catalogue/ScheduleCField`), catalogue import column "Schedule C/C1" (yes/no; blank keeps; other =
  row error). `devLicenceRegister` now adds each missing register TYPE. Template xlsx not edited (column read by heading).
- C. Retention (C-44): `retention.days` keys `reminder_dose_logs` (730), `ended_reminders` (730), optional
  `inactive_health_profiles` (unset = until withdrawn / erasure; ≥ 365; deletes profile + wipes members' health
  fields for accounts not signed in / updated that long); migration merges defaults without changing set values;
  admin Settings → Data retention shows them. Export / erasure already covered them (Sprint 33) — smoke-checked.
- D. Switched-off category / HSN: trigger `dawabag_catalogue_lists` (migration 29) raises check_violation
  (`products_category_switched_off` / `products_hsn_switched_off`, plain messages in errorHandler) for a new
  product or a move to a switched-off entry; a product that already had it keeps it; category rename sets
  `dawabag.catalogue_list_rename` so products move with it. Catalogue import rows fail with a plain reason
  (`switchedOffProblems`).
- Tests: jest 57 suites / 463 (new: zipGuard, documentCheck, sessionRevocation, errorHandler, ownership,
  parsingLimits, catalogueImport sprint34, retention.sprint34; sellingRights updated); `test/sprint34.smoke.mjs`
  (92 checks incl. a second API on port 4134 for the upload limit) in test:smoke — full smoke green; Playwright 114 passed, 3 skipped.
- mobile/ untouched by this work (the app section below is the other agent's).

## Sprint 34 — app follow-ups (mobile only, 2026-10-02, uncommitted)
Closes the app's open items from Sprints 26, 30, 32 and 33. No backend change needed.
- **Dose alerts survive a restart:** manifest RECEIVE_BOOT_COMPLETED + flutter_local_notifications
  `ScheduledNotificationBootReceiver` (BOOT_COMPLETED, MY_PACKAGE_REPLACED, QUICKBOOT) — the plugin re-sets
  its own stored alerts (its OS records: time, generic text, reminder ids; no medicine names, C-41); the app
  still re-syncs from GET /reminders/upcoming on start / sign-in / each change.
- **"Taken" / "Skip" on the alert:** `services/dose_actions.dart` (payload `dose:<ids,…>@<UTC ISO>` — every
  reminder due at that minute; parse, action ids, `answerDoseAlert`, `myMedicinesLocation` /
  `doseFromQuery`), `services/local_notifications.dart` (ONE plugin set-up shared with order pushes —
  a second `initialize` used to replace the tap handlers; iOS category `dawabag_dose` with both actions
  `authenticationRequired`; permission asked only when there are alerts to set, iOS via
  requestPermissions, not at start-up; foreground action → apiService.logDose; cold-start tap routed from
  main() even without Firebase), `services/dose_action_background.dart` (`@pragma('vm:entry-point')`
  background isolate: keychain refresh token → POST /auth/refresh → stores the rotated token → POST
  /reminders/:id/doses, the same call as My medicines; never deletes the token on failure; failure →
  generic "Your answer was not saved" alert whose tap opens My medicines on that dose). Android actions run
  without opening the app (showsUserInterface false, cancel the alert); iOS AppDelegate sets
  `FlutterLocalNotificationsPlugin.setPluginRegistrantCallback` + UNUserNotificationCenter delegate.
  `/account/medicines?dose=&at=` → MyMedicinesBody highlights the dose (amber card + row, scrolled to,
  "Mark the dose from your reminder below"). Risk: the background refresh and an open app refreshing in
  the same instant can sign the app out (refresh tokens rotate) — narrow window, accepted.
- **Trade prices paused banner** (Sprint 32 web parity, C-14): `models/trade_prices.dart`,
  `services/trade_price_api.dart` (GET /users/me/trade-prices), `providers/trade_price_provider.dart`
  (retailers/wholesalers only, autoDispose), `widgets/trade_price_banner.dart` (web words + "Send the
  renewed licence" → /account/licences) on Search, product page, cart and checkout.
- **Order confirmed** repeats "Prescription (photo uploaded …) ✓ — our pharmacist checks it before dispatch"
  + "Next: our pharmacist checks…" and the web's title "Order placed and paid" (C-08).
- **Licence copies as PDF too:** `screens/account/licences/licence_copy_picker.dart` (Take photo / Choose
  from gallery / Choose a PDF via file_picker; `licenceCopyProblem` = server rule PDF/JPG/PNG ≤ 5 MB) used by
  the renewal form and Upload / Replace copy.
- **Search tab debounce** now `kTypeaheadDebounce` (250 ms, same as home).
- **Small phones / large text:** product page checked at 360 dp × textScaler 1.3 with long content.
  Fixed: DeliveryInfoCard "To <PIN> (city) · Change PIN" row (now Wrap), SafetyRow (topic + level wrap,
  note below), and a real crash — AppTheme's outlined buttons are full width (min width ∞), so the PIN
  "Check" button and My medicines' Taken / Skipped / Set reminder buttons in rows threw "BoxConstraints
  forces an infinite width" in the real theme; they now size to their text. Dose rows wrap.
- Tests: sprint34_dose_actions_test (10), sprint34_app_followups_test (8), sprint34_product_layout_test (2,
  golden-free, app-like button theme, opens all 8 closed accordions and scrolls to the end);
  sprint32_licences_test moved to the copy API. Flutter 154 pass; analyze: only the 13 older infos.
- Not done / not verifiable here: no Android/iOS build in this container (no Android SDK, no Xcode) — the
  manifest receivers and the Swift AppDelegate change are unbuilt; background actions need a device test
  (Android: action from a killed app; iOS: unlock prompt, keychain in the background engine).

## Sprint 32 — app parity (mobile only, 2026-10-02, uncommitted)
Brings the Flutter app up to the web (gaps listed in Sprints 25, 26, 28, 30). No backend change.
- **Home search dropdown:** `widgets/home/home_search_box.dart` (OverlayPortal + CompositedTransformFollower
  under the box; TextField groupId so taps in the list stay inside) replaces the tap-to-open SearchEntry on
  home. 2+ characters, 250 ms debounce, `providers/typeahead_provider.dart` → GET /products/search?q=&limit=6
  (+ pincode, as the Search tab). `widgets/search/typeahead_panel.dart` ("N medicines found", options,
  "No medicines found" + "Did you mean" from /products/search/suggest, "See all results for “q”") and
  `typeahead_option.dart` (name, generic, ScheduleBadge, buyer's price, "Out of stock", CartQuantityControl
  Add → − qty +). Submit / See all → `/search?q=` (SearchScreen.didUpdateWidget takes a new query).
- **Checkout in the web's order:** address → prescription → review → place order → payment
  (`checkout_flow.dart`: CheckoutStep adds rxFix; checkoutNextStep / checkoutPreviousStep / barIndex /
  buttonLabel; `placeOrderThenAttachRx` = POST /orders then POST /prescriptions/:id/use-for-order;
  `attachRxToPlacedOrder` for the retry). `checkout_prescription.dart` now only chooses (GET
  /prescriptions/my usable ones) or uploads new without an order (POST /prescriptions/upload → chosen);
  the old pick-a-file-and-upload-with-order path (`uploadOrderPrescription`) is removed. PrescriptionStep
  = Rx lines, `RxChoiceCard` radio cards (thumbnail from the signed link, "Uploaded <date, time>", status
  words, "Chosen"), Show all after 4, upload card ("Or upload a new one": photo or PDF), wording hint,
  RxPolicyNote (C-08/C-37), error box. Review shows "Prescription (… uploaded …) ✓" with Change + policy;
  button "Place order and pay". A refused prescription → rxFix ("<server reason> Please choose or upload
  another one for order X."; Back → /orders). Once placed, Back from review leaves checkout.
- **Forced password change:** `services/api_utils.dart` isPasswordChangeRequired (403 +
  code PASSWORD_CHANGE_REQUIRED); ApiService interceptor calls `onPasswordChangeRequired`; AuthState
  `mustChangePassword` (from login/refresh `must_change_password`; completeSignIn skips /users/me and push
  until changed). `config/password_gate.dart` (router redirect to `/account/change-password?required=1
  &next=…`, safe continue path). `services/password_api.dart` POST /auth/change-password {current, new,
  refresh_token} → new session stored (refresh token keychain only). `utils/password_policy.dart` mirrors
  backend passwordPolicy.ts words. `screens/account/password/` ChangePasswordScreen (forced: no Back,
  Sign out; voluntary: Account → Change password) + ChangePasswordForm.
- **Licence renewal in the app:** `models/licence_draft.dart` (forms list, suggested first per account
  type, licenceDraftProblems = web wording, toBody), `licence_api` submitLicences (POST /users/me/licences)
  + uploadLicenceCopy (POST /users/me/licences/:id/document, field `file`, ≤5 MB). `/account/licences/renew`
  LicenceRenewalScreen + LicenceRenewalForm (form dropdown, Other name, number, issued by, valid-till date
  picker, optional photo via image_picker); list has "Send a renewed or another licence" and Upload /
  Replace copy on pending licences ("Copy on file").
- **Schedule badges:** `utils/drug_schedule.dart` (now case-tolerant like the web, + isScheduleH1,
  scheduleListBadge) and `widgets/schedule_badge.dart` (Rx / Non-scheduled); search result tile,
  product page Rx notice, cart_actions and ProductBuyBar no longer hard-code schedule lists.
- Tests: sprint32_search_test (6), sprint32_checkout_test (10), sprint32_password_test (8),
  sprint32_licences_test (5); sprint26 prescription-step test moved to the new widget API. Flutter
  120 tests pass; flutter analyze unchanged (13 old infos, no new).
- Not done: licence copy as PDF from the app (photo only); the confirmation screen does not repeat the
  prescription line (the web's does); the Search tab keeps its own 350 ms debounce.

## Sprint 32 — selling rights, live licence pricing, dispatcher crash, list management (2026-10-02, uncommitted)
Closes gaps left by Sprints 23, 28, 30 and 31. Decision row in DECISIONS.md (developer's reading — confirm).
- A. Selling rights by licence and buyer type (`services/stock/sellingRights.ts`, pure + SQL, C-33/C-07):
  sale kind = `saleKindFor(pricing_type)` — 'customer' (consumers, teleconsultation patients, signed-out,
  trade accounts awaiting KYC or with a lapsed licence) = retail; b2b_retailer / b2b_wholesaler /
  doc_hospital = trade. Partner may supply retail only with a checked, in-date Form 20 or 21 in
  party_licences; trade only with 20B or 21B (all four = both). No legacy fallback: a partner with no
  register rows (or only "other") sells to nobody. Dawabag's own stock: business_licences active
  retail_20/21 resp. wholesale_20b/21b with valid_upto NULL or ≥ today. Missing kind → own stock NOT
  offered (blocked) + admin dashboard warning. Schedule C/C1 not tracked on products → one licence of
  the kind is enough (C-comment says where to require 21/21B later). The Sprint 30 "any lapsed licence
  stops the partner" summary check stays alongside.
  Same SQL everywhere: `stock/partnerStock.ts` partnerStockSql / partnerNearestExpirySql take the kind;
  new ownStockSql / ownNearestExpirySql / sellableStockSql; used by search (productSearch.service),
  product page (productDetail: product row still cached, stock now read LIVE per kind), cart
  (cart.service productRows), cards (shopping/productCards stockQtySql(pricingType)) and allocation
  (allocateAndReserve `saleKind`, own candidate only if register allows; partnerCandidates filter).
  Pricing unchanged. `stock/sellingRightsStatus.ts` + GET `/admin/selling-rights` (admins): dawabag
  {retail, trade}, partners with live listings {retail, trade}, warnings (dawabag_no_retail_licence,
  dawabag_no_trade_licence, partner_no_rights) → web `components/admin/SellingRightsWarnings` on /admin.
  Dev/CI: `src/scripts/devLicenceRegister.ts` (run by scripts/dev-up.sh, refuses production) adds
  DEV-ONLY placeholder register rows only for a kind not covered. Test partners inserted straight into
  vendors now get register licences: `backend/test/support/partnerLicences.mjs` licencePartner()
  (sprint3, 5, 6, 27, 29 fixtures) and e2e partnerStock / partnerDrafts specs.
- B. Live trade prices (`services/licences/tradePrices.ts`): auth.middleware (authenticate +
  optionalAuth) sets `pricing_type` via livePricingType — approved (or pending_renewal) b2b_retailer /
  b2b_wholesaler with any checked licence lapsed (Sprint 30 eligibility) → 'customer' + `trade_paused`
  {form, label, licence_number, expired_on}. Every price path already reads pricing_type (search, product,
  cart, checkout preview/order — orders are still refused with the licence named, C-14). GET
  `/users/me/trade-prices` → web `components/shop/TradePriceBanner` ("Your drug licence Form 20 X expired
  on 01 Oct 2026 — trade prices are paused until a renewal is checked. Send the renewed licence" →
  /account/licences) on search, product page, cart and checkout. Refill job still uses
  effectiveCustomerType (placeOrder refuses lapsed buyers anyway).
- C. Dispatcher crash (`services/notifications/dispatcher.ts`): cause = channel promises created early
  and only awaited (allSettled) after more awaits, so a delivery-row FK failure became an unhandled
  rejection → process exit. Now each channel runs through `safely()` (catch + log at creation), the
  delivery INSERT … WHERE the notification still exists, FK 23503 on notification/user = quiet skip
  ("removed meanwhile"). `config/processGuards.ts`: 'unhandledRejection' logs once serving; before the
  server listens it exits 1 (startup failures still crash); `server.on('error')` exits 1.
- D. Admin → Catalogue lists (`/admin/catalogue-lists`, nav under Catalogue & stock, PHARMACIST_ROLES;
  pharmacists read-only): tabs Categories / HSN codes, server search `?q=` (inactive included) or
  `?all=true`. PATCH `/catalogue-lists/categories/:id` {name?, is_active?} and `/hsn-codes/:code`
  {code?, description?, gst_rate?, is_active?} (admin, super_admin) — `catalogueLists/manage.service.ts`,
  rules categoryRenameProblems / hsnEditProblems. Category rename updates products (by name key, drafts
  and removed included) in the same transaction, clears product cache, audit product_category_renamed
  {products_updated}; rename onto another entry = 409 (no merging). HSN: code locked once ANY product row
  uses it (409, plain reason), unused code correctable (not onto a listed one); GST rate is a hint, no
  product GST changed; audit hsn_code_changed. Switch off/on: audit *_deactivated / *_reactivated;
  pick-lists show active only; products keep the entry; product form refuses an inactive entry for a
  NEW choice (registerFromProductForm `current`); "+ New" by a pharmacist on a switched-off entry → 409
  (only admins reactivate). Web: `components/admin/catalogueLists/*`, `lib/admin/catalogueListsAdmin.ts`.
- Tests: jest sellingRights (11), tradePrices (8), processGuards (2), dispatcher.crash (3, fails on the
  old dispatcher), catalogueLists rules (+6); `test/sprint32.smoke.mjs` (90 checks, in test:smoke:
  20/21-only, 20B/21B-only, all-four and unlicensed partners × retail / trade buyer for search, product,
  cart and allocation; own stock blocked without a wholesale register licence + dashboard warning; live
  pricing lapse → banner data → renewal; list management; notifications deleted mid-dispatch, API stays
  up); e2e `tradePrices.spec.ts`, `catalogueLists.spec.ts` (desktop + phone).
- Not built: Schedule C/C1 on products (so 21/21B not required per line); a register row's NULL
  valid-till counts as in force; catalogue import / DB trigger still accept a switched-off category or
  HSN (only the API forms refuse it); category merge; mobile app banner for paused trade prices (the app
  gets retail prices from the API already) — mobile/ untouched (another agent).
## Sprint 33 — medicine information, substitutes, trust, reminders, health profile (2026-10-02)
Owner-approved; structure inspired by Tata 1mg / Apollo / PharmEasy / Truemeds product pages — NO text
copied (copyright, C-19): medicine words are entered by our pharmacist from the package insert.
Built in a separate worktree while Sprint 32 (migration 27) was finished on the main checkout.
- DB `28_sprint33_medicine_info.sql`: `product_info_versions` (product, version, status draft |
  pending_review | approved | rejected | superseded, content JSONB, claim flags, submitted/reviewed
  by+at, review_notes, reviewer_name + reviewer_reg_no snapshot; one open (draft/pending) and one
  approved per product by partial unique index; CHECK approved ⇒ signed with reg no);
  `info_pages` (3 trust pages, versioned, seeded v1, {{tokens}}); `medicine_reminders` (times TEXT[]
  1–6 HH:MM IST, start/end, source order|manual, is_active) + `reminder_dose_logs` (one answer per
  dose, UNIQUE reminder+scheduled_for); `health_profiles` (allergies / conditions / current_medicines
  JSONB, consent_version); `patients` + age_years, age_recorded_on, allergies, conditions (family
  members = the existing patients list, one authority); consent purpose 'health_profile'.
- Medicine information (`services/medicineInfo/`): content.ts (zod: overview, uses, how to use, how it
  works, side effects common/serious/contact doctor if, safety alcohol/pregnancy/breast-feeding/driving/
  kidney/liver × safe|caution|unsafe|consult_doctor|not_known + note, missed dose, interactions
  medicines/food/conditions, quick tips, fact box incl. habit forming, FAQs, references; publicSections
  drops empty sections; claims via utils/claimsCheck), versions.service (save draft — a new version
  when nothing is open, editing a submitted one sends it back to draft; submit needs text + a source;
  review = pharmacist_rx with reg no, flagged text needs a ≥20-char reason (same rules as C-19 copy),
  approve supersedes the old live version; audit product_info_draft_saved / _submitted / _approved /
  _rejected, C-46). Buyers: only the approved version of an active, sellable product + "Reviewed by
  <name>, Reg. no. <x>, on <date>" + "For information only. Follow your doctor's advice."
- API `/api/v1/medicines`: GET `:id/info` (public), `:id/substitutes?limit=`, `:id/delivery?pincode=`
  (optionalAuth); staff (pharmacist_rx/admin/super_admin) GET `:id/info/editor`, PUT `:id/info/draft`,
  POST `:id/info/submit`, GET `info-review/queue`; POST `:id/info/review` pharmacist_rx only.
  `/api/v1/info-pages` (GET list / :key public; admins GET :key/history, POST :key = new version,
  unknown {{token}} refused, audit info_page_published). `/api/v1/reminders` (GET, GET upcoming?hours,
  GET suggestions = delivered orders' medicines without a reminder, POST, PATCH/:id, DELETE/:id,
  POST/:id/doses {scheduled_for, status} — must be a real dose time, ≤ 12 h ahead, ≤ 7 days back).
  `/api/v1/health-profile` (GET, PUT {consent?, lists}, DELETE = withdraw + delete, members
  POST/PUT/DELETE; GET orders/:orderId for pharmacist_rx / pharmacist_pack → the order's person
  (family member when the order names one), only with consent, each look audited
  health_profile_viewed). Error log redacts allergies/conditions/medicine names.
- Substitutes (`services/shopping/substitutes.ts` + `.service.ts`): reuses sameMedicine.medicineKey
  (generic + every strength + form + release + schedule; Sprint 33 adds ROUTE — eye/ear/nasal/inhaled/
  vaginal/rectal/injection/skin/oral — which also makes the cart's cheaper option stricter); packs
  comparable by unit kind (packSize: tablets/caps/ml/g, "2 x 10"); sorted by price per unit, then in
  stock, then name; save_pct per unit (floor, ≥1 %); SELLABLE_SQL listing rules (C-10), buyer's own
  price. Never swaps anything.
- Delivery date (`services/productPage/deliveryEstimate.ts` pure + `delivery.service.ts`): no product-
  page ETA existed; reuses the checkout's promises (pincode_serviceability.estimated_days for any
  seller, dawabag_delivery_hours for own stock), takes the SLOWER of the sellers that could supply,
  +1 day for an Rx line (pharmacist check), +1 after 14:00 IST, never a Sunday, always "Estimated".
  Cold-chain product to a PIN without cold_chain_available and no partner stock → no date, says why.
  PIN from the query or the signed-in buyer's default address. Product detail adds
  `expires_on_or_after` ("Mar 2027", earliest sellable batch > 30 days, = allocation's FEFO rule) and
  `cold_chain_note` (C-25).
- Trust pages (server-held, chosen over Markdown in the repo: admins can edit; {{tokens}} filled from
  live settings: sell/receive shelf life, returns 48 h / 30 d / 90 d): "Genuine medicines", "Expired,
  damaged and recalled medicines", and **"How a pharmacist checks your order"** — the owner's title
  "Every order checked by a pharmacist" was NOT used because the system does not do that: only
  prescription orders get a pharmacist's check; packing is open to pharmacist_pack AND admins; partner
  shipments are packed by the partner. Owner to confirm the wording or change the process.
- Web: product page (`components/shop/`): DeliveryInfo (PIN box → "Get it by …" (estimated), expiry,
  cold chain), ProductTrustStrip, substitutes/SubstitutesPreview (top 3 + "See all n"), medicineInfo/
  MedicineInfo (desktop sticky section tabs, phone accordion), `/medicine/[id]/substitutes`,
  `/trust/[key]` (+ footer TrustLinks), staff `/staff/medicine-info/[productId]` editor (links from New
  products cards and admin product page; Save draft / Send for pharmacist review; versions), Product
  copy page shows "Medicine information" queue (InfoReviewCard previews exactly what buyers see),
  admin `/admin/info-pages` (menu Compliance → Trust pages), `/account/medicines`, `/account/health`
  (consent box never pre-ticked), RxReviewDialog shows BuyerHealthNote. No browser storage.
- App: product screen DeliveryInfoCard, ProductTrustStrip, SubstitutesSection (+ /medicine/:id/
  substitutes), MedicineInfoView (ExpansionTiles); /trust/:key; Account → My medicines (reminders,
  Taken/Skipped) and Health profile. Dose alerts: `services/dose_alarms.dart` plans from GET
  /reminders/upcoming (72 h, ≤ 60 alerts, ids 700000+, same-minute doses merged, generic text without
  the medicine name — lock-screen privacy) and `providers/reminder_provider.dart` DoseAlarmSync re-sets
  them on start, sign-in/out and after each change; flutter_local_notifications zonedSchedule (+
  `timezone` 0.9.4 now a direct dependency, manifest ScheduledNotificationReceiver/
  ActionBroadcastReceiver, no boot receiver). Tapping an alert opens My medicines
  (NotificationTapRouter.openLocalPayload). Note: the plugin itself records its scheduled alerts with
  the OS (time + generic text + reminder id) — the schedule's authority stays the server.
- Privacy: export includes health_profile, family_members, medicine_reminders (+ answers); erasure
  deletes health profile + reminders and wipes members' health fields; consent label in web privacy.
- Tests: jest +42 (content, visibility, substitutes, deliveryEstimate, schedule, health rules, trust
  tokens) → 404; `test/sprint33.smoke.mjs` 116 checks (in test:smoke; full smoke green); Playwright
  `medicinePage.spec.ts` 8 desktop + 6 phone (full run 98 passed, 5 skipped); Flutter +14 (4 files) →
  134; flutter analyze: only the 13 older infos.
- Not built: reminder_dose_logs retention purge; boot-time re-scheduling; notification action buttons
  (Taken/Skipped from the alert itself — the tap opens My medicines); medicine info editor in the app
  (staff work on the website); app screens for trust pages are read-only (no admin editing in app);
  pharmacist health note on the packing queue (only the prescription check dialog).

## Sprint 31 — queue quick-create (Alt+C) and optional buyer copy (2026-10-02, uncommitted)
Owner, for "New products to complete": "Category — create new by ALT+C", "HSN code — create new
by ALT+C", "Description for buyers — enter it while editing after save, not mandatory while save",
"Drug schedule, create new Non scheduled also".
- Before: products.category / hsn_code were free text; pick-lists were "what live products use"
  (datalists). Now DB `26_sprint31_catalogue_lists.sql`: `product_categories` (name, generated
  name_key = lower + collapsed spaces, UNIQUE; is_active, created_by/at) and `hsn_codes` (code PK
  CHECK 4/6/8 digits, description, usual gst_rate slab or NULL, is_active, created_by/at), both
  back-filled from products (HSN with its most common GST). Trigger `products_catalogue_lists`
  (BEFORE INSERT/UPDATE OF category, hsn_code) spells a product's category as listed and adds
  any new category / valid HSN from other paths (import, seed, fixtures). products keep the
  name/code (shop filters by name). products_drug_schedule_check now includes 'Non-scheduled'.
- `services/catalogueLists/` rules (pure: tidyName, categoryKey, categoryNameProblems 2–60 chars,
  letters/marks/digits & , . - ' ( ) / +; tidyHsn, hsnProblems, findDuplicateCategory,
  hsnGstMismatch; GST_RATES / HSN_RE now live here, re-exported by catalogueDrafts/rules) and
  lists.service (list, create — duplicate returns the existing entry + note, an HSN taken from
  the catalogue without words gets them filled; requireCategory / requireHsn for the queue;
  registerFromProductForm for POST/PATCH /products: admins' new names are added, audited).
  Audit: product_category_created / _reactivated, hsn_code_created / _completed (C-46).
- API `/catalogue-lists/categories` and `/hsn-codes` (GET, POST; pharmacist_rx/admin/super_admin).
  Queue PATCH and bulk-set refuse a category / HSN not in the list ("add it with + New (Alt+C)");
  `/catalogue-drafts/options` now only schedules/forms/GST. Draft view joins hsn_codes →
  hsn_gst_rate; draftWarnings adds "HSN x usually has GST y%, but this product is set to z%"
  (GST never changed).
- Description: no longer required to approve (no C-17/C-19 code rule needs one; the product form
  never did); if written it must be ≥10 chars. `PATCH /catalogue-drafts/:id/description`: open
  draft = ordinary save; approved = `changeLiveCopyTx` (productContent.service: content_status
  pending_review + flags + audit product_copy_changed) → Product copy queue (C-19); not_listed →
  409. Admin product page edits it as before (same C-19 path) and says "No description yet".
- Non-scheduled: SCHEDULES / product z.enum / web DRUG_SCHEDULES; import accepts non-scheduled,
  non scheduled, nonscheduled, NS; Rx logic unchanged (only H/H1 need a prescription); NOT put in
  telemedicine List O automatically (trigger keeps OTC only, C-23). Web badge "Non-scheduled"
  (neutral); mobile `utils/drug_schedule.dart` (isRxSchedule etc.) for badges / order lines.
- Web: `components/catalogueLists/` SearchableSelect (ARIA combobox, accepts list entries only,
  "+ Add …" option), QuickCreateArea (Alt+C / Option+C inside the field only, preventDefault
  only when our dialog opens; ignores keys typed in the dialog), NewButton "+ New" (title
  "New … (Alt+C)"), QuickCreateHint, NewCategoryDialog / NewHsnDialog (portals — the field can
  sit inside a form), CategoryPicker / HsnPicker ("File says … use it / add it to the list and
  use it", GST note), `lib/catalogueLists.ts`. Used in DraftFieldsGrid, BulkSetBar and the admin
  ProductForm (ProductFieldGrid `custom`). DraftCard: "No description yet — add one";
  BuyerDescription on approved rows. fetchCategories (lib/admin/products) removed.
- Tests: jest catalogueLists/rules (8) + drafts rules / import / customerType additions;
  `test/sprint31.smoke.mjs` (41 checks, in test:smoke; sprint29 smoke now adds its category/HSN
  first and approves without a description); Playwright partnerDrafts (Alt+C desktop, "+ New"
  phone, approve without description, add it after, Non-scheduled) and admin.spec (form Alt+C);
  flutter drug_schedule_test.
- Not built: renaming / deactivating list entries in the UI (is_active exists); HSN master data
  import; per-category tiles in the shop from the list.

## Sprint 30 — drug licences for every party (2026-10-02, uncommitted)
Owner: "All the Drug Licences should be saved and displayed" — retailers, wholesalers,
suppliers/companies, partners (first partner Nootan Pharmaceuticals, Pune: 20, 21, 20B, 21B).
Audit (before → after):

| Party | Forms | Stored before | Shown before | Gap fixed in Sprint 30 |
| --- | --- | --- | --- | --- |
| Marketplace partner | 20, 21, 20B, 21B (+ any) | vendor_licences (S28, 4 forms only) + vendors.drug_license_* | admin detail, invoice line | moved into party_licences; any form; portal "Your drug licences" + renewals waiting for check; list badge; checkout shows all |
| Supplier / company | 20B/21B, 25/28, 25A/28A, 25B | vendors.drug_license_no only; form + expiry typed at approval | supplier list (one number), PO header, GRN supplier_dl_no | add/edit with repeatable rows; must hold wholesale or manufacturing licence; all licences on list, PO and GRN record; PO/GRN blocked naming the lapsed licence |
| Retailer (B2B) | 20 / 21 (+20A/21A) | users.drug_license_number/type/expiry (one) | KYC detail, queue, invoice buyer line | sign-up takes several licences; one KYC check per licence; "Your drug licences" (web + app) with renewal; all printed on B2B invoices |
| Wholesaler (B2B) | 20B / 21B | same single columns | same | same; must hold 20B or 21B |
| Doctor / hospital | optional (hospital pharmacy 20/21 or other) | none | none | optional licences at sign-up / account; not required for KYC |
| Dawabag | 20/21/20B/21B, 20A/21A, 20F/20G | business_licences register AND app_settings legal.drug_licences (two authorities) | footer, checkout, invoices from the setting | register is the one authority (setting copied in and removed); footer/checkout/invoice read the register |
| Schedule X 20F/20G, homoeopathic 20C/20D | — | not supported | — | accepted as forms (never sold online, C-10); "Other" with a typed form name for anything else (e.g. 21C — not guessed) |

- DB `25_sprint30_party_licences.sql`: `party_licences` (vendor_id XOR user_id, generated party_type,
  form dl20…dl28a|other + form_name, number + generated number_key (A-Z0-9 upper), issued_by,
  valid_from/upto, status pending/verified/rejected/superseded, document_* (private store),
  verified_by/at, last_alert_days). Unique: one verified + one pending per party+form.
  vendor_licences copied in and replaced by a read VIEW; old single licences of vendors/users/
  pharmacy_profiles copied (unknown form → "other: Drug licence (form not recorded)").
  Trigger `refresh_licence_summary` keeps vendors/users drug_license_no|number/_type/_expiry =
  first CHECKED form (licence_form_rank) + EARLIEST checked valid-till, so every old check
  (allocation, partnerStock, assertPartnerCanSell, supplierCheck, KYC expiry job) now covers all
  licences. business_licences types + restricted_20a/21a, schedule_x_20f/20g. orders.buyer_drug_licences,
  order_shipments.seller_drug_licences (JSONB snapshots, C-13); goods_receipts.supplier_dl_no 600 chars.
- `services/licences/`: forms (pure: forms, normaliseForm "20"/"Form 21B"/"DL-20B"/"retail_20",
  REQUIRED kinds per party, licenceProblems, licenceSummary, eligibility {expired, missingKind,
  warnings ≤30 d}, licenceLine), input (zod, shared), register.service (listLicences with legacy
  fallback, licencesByParty, licenceBadge, assertNumbersFree — same number on another business
  refused incl. Dawabag's register; vendor↔buyer of the SAME GSTIN allowed; saveCheckedLicencesTx,
  submitLicencesTx, decideLicenceTx (verify needs future valid-till; supersedes), scans, Dawabag's
  licences), alerts.service (job `party_licence_alerts` 01:45, 60/30/7/0 days, admins + partner
  logins + buyer; push/email only — SMS needs a DLT template).
- Blocks: partner any checked licence lapsed → not allocated / no listing (C-33); supplier → PO
  and GRN refused naming the licence (C-02; no wholesale/manufacturing licence = WARNING only,
  rulebook comments silent); B2B retailer/wholesaler → order refused on the day + nightly
  pending_renewal (C-14); renewal sent by holder waits; verified renewal re-activates (checkAndActivate).
- API: /admin/partners (licences any form, detail waiting_licences/licence_line/badge), POST/GET/PUT
  /purchasing/suppliers[/:id] {licences} (old drug_license_no body still works), POST /vendors/:id/approve
  (form/date optional when licences exist), GET/POST /partner/licences[/:id/document[-url]],
  GET/POST /users/me/licences[…], GET /admin/party-licences?filter=waiting|expiring|expired|all,
  POST /admin/party-licences/:id/decision, …/document(-url), PUT /kyc/admin/applications/:userId/licences;
  /auth/register `licences` (or old single pair); /kyc/admin/verify-drug-license takes licence_id/any form.
- Web: shared `components/licences/*` (LicenceRowsEditor, LicenceList, LicenceExpiryBadge,
  YourLicencesSection, LicenceDecisionDialog, LicenceDocumentButton), `lib/licences/*`; partner
  form rows; supplier add/edit dialog + table; vendors lists; KYC Drug licences card + per-licence
  check; register extra licence rows; /account/licences; partner dashboard section; checkout all
  seller licences; footer list from the register; Licence register page "Partner, supplier and
  buyer licences" work list; Settings no longer edits drug licence numbers.
- Mobile: account "Your drug licences" (B2B/doctor accounts) read-only screen (`models/drug_licence.dart`,
  `services/licence_api.dart`, `screens/account/licences/*`); flutter analyze + test pass (SDK at /opt/flutter-sdk).
- Tests: jest licences forms + migration (58); `test/sprint30.smoke.mjs` (in test:smoke); e2e
  `licences.spec.ts` (desktop + phone); `partnerOnboarding.spec.ts` updated; sprint28/sprint5 smoke
  wording updated; flutter `sprint30_licences_test.dart`.
- Not built: partner self-registration (does not exist — admin onboards); retail-vs-wholesale
  rights by buyer type in allocation (unchanged from S28); e-invoice payload has no licence field
  (IRP schema); delivery labels / settlement statements never showed licences (not added);
  trade price shown to a buyer whose licence lapsed until the nightly job (orders are refused at once);
  form numbers 20C/20D/20F/20G/25B per our reading of the Rules — lawyer to confirm.

## Sprint 29 — draft products from partner requests (2026-10-02, uncommitted)
The first real partner file (MediVision) has ~329 items not in the catalogue; creating each by
hand was too slow. Now: requests → admin "Create drafts" → pharmacist completes → partner
re-check / re-upload → Apply.
- DB `24_sprint29_catalogue_drafts.sql`: `products.catalogue_state` live | draft | not_listed |
  rejected; CHECK `products_active_only_live` (NOT is_active OR live) — a draft or a Schedule
  X/NDPS approval can never be active (C-10); drug_schedule / category / gst_rate now NULLable
  but only while draft/rejected (CHECK `products_decided_unless_draft`); new `strength`,
  `dosage_form`. `catalogue_drafts` (product_id PK, from_file JSONB incl. every grouped request,
  cold_chain_decided, status open/approved/not_listed/rejected, decided_by/at/note).
  partner_product_requests status + 'drafted'; unique open index now covers open+drafted.
- `services/catalogueDrafts/`: rules (pure: approvalProblems, prescriptionFor via
  requiresPrescription, suggestedDescription "generic strength form. Pack: …", draftWarnings
  HSN-30 vs 18/28 % and claims, HSN 4/6/8 digits, GST 0/5/12/18/28), dedupe (pure:
  requestKey = Sprint 27 rowTokens tokenKey + pack + company; groups a batch; links to ONE
  active product or earlier draft with same words+strength, same pack (both known or both
  blank) and companies agreeing; >1 fit, X/NDPS fit or no MRP → skipped for a person),
  create.service (one txn, FOR UPDATE of open requests, draft = name/pack/company code
  (marketed_by)/GST if a slab/MRP (offer = MRP), SKU NEW-xxxxxxxxxx, partner_item_links →
  draft (source admin), request 'drafted'; active match → 'linked'; audit
  catalogue_drafts_created), queue.service (list with filters company / needs_schedule /
  cold_chain / q, progress done-of-total, companies; save-as-you-go with per-save audit
  catalogue_draft_saved; bulk-set ONLY category/HSN/manufacturer name+address/country),
  decide.service (approve: live + active + `reviewContentTx` = the same C-19 code path as
  the Product copy queue (now split out of reviewContent; refuses drafts); flagged copy needs
  the pharmacist's own ≥20-char note; requests → linked; X/NDPS → not_listed, requests
  rejected "never sold online (C-10)", links deleted; reject → soft delete, requests rejected
  with reason, links deleted; all audited).
- API `/catalogue-drafts` (GET list, GET options, GET/PATCH :id, POST bulk, POST :id/reject —
  pharmacist_rx/admin/super_admin; POST :id/approve — pharmacist_rx only, as C-19 copy review);
  POST `/admin/partner-product-requests/drafts` {request_ids}|{all_open} (admins).
  Guards: PATCH /products is_active on non-live → 409; contentQueue skips drafts; e-prescription
  refuses drafts; partner import shows "Dawabag is adding this product" for draft-linked items;
  resolveProductRequest to a draft → 'drafted'. Every customer path already reads is_active
  (verified by `visibility.test.ts`, which scans buyer/partner product queries).
- Web: admin Partner stock files → requests with checkboxes, "Create drafts (n)" / "Create drafts
  for all open requests", result dialog (`DraftsCreatedDialog`), tab "Drafts being completed";
  staff `/staff/new-products` "New products to complete" (menu under Catalogue & stock,
  PHARMACIST_ROLES): progress bar "x of y done", To complete / Done tabs, filters, one card-row
  per product (from-file panel read-only + fields saved on blur/Enter/change), "Still needed"
  list, Approve (pharmacist only) / Approve as never sold online / Not a medicine we list,
  "Set for all chosen" bar. `components/staff/newProducts/*`, `lib/admin/catalogueDrafts.ts`.
- Tests: jest catalogueDrafts rules/dedupe/visibility (56); `test/sprint29.smoke.mjs` (62
  checks, in test:smoke); e2e `partnerDrafts.spec.ts` (desktop + phone, serial).
- Not built: drafts for requests without MRP; editing prices (offer = MRP until an admin
  changes it in Products); pharmacist reg-no requirement for approval (C-19 path has none);
  mobile app screens; telemedicine list for approved drafts is set only for OTC (trigger).

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
- **Trial status (2026-10-02 night):** Sprints 34-35 live (deploy run 37036192548): security
  fixes, Schedule C/C1, pharmacist check on every order, DAWA BAG rebrand (web, app, PDFs),
  OTP password reset, Razorpay TEST keys added by the owner (real test checkout; untested by a
  person yet). Open: owner to confirm partner-pharmacist release and second-pharmacist approval
  of medicine info; app still lacks the order 'Pharmacist check' step and order_on_hold handling;
  DLT template for order_on_hold SMS.
- **Trial status (2026-10-02 evening):** Sprints 30-33 live (deploy run 37025737154). Open owner
  question: trust page wording "How a pharmacist checks your order" vs a pharmacist check on
  every order. Rebrand to DAWA BAG waits for the logo file.
- **Trial status (2026-10-02 pm):** Sprints 26-29 live (deploy run 37003151653): demo checkout
  per method, partner stock upload (MediVision Platinum), admin Add partner, catalogue drafts +
  pharmacist queue. Owner given a one-paste server script to add Nootan Pharmaceuticals as
  partner (real GSTIN/licences/pharmacists/logins kept only in the trial DB, never in the repo).
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
