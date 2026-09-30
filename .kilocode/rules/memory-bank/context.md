# Active Context

## Current state (2026-09-30)
The February Kilo Next.js prototype was replaced by the Dawabag v2 package
(built in a Claude chat, 30 Mar 2026). Sprint 1 is in progress on branch
`claude/dawabag-pharmacy-status-0h7mr3`.

## Standing rules from the owner (2026-09-30)
- Server is the single source of truth: no local storage anywhere (see DECISIONS.md).
- Modular software: no monolithic HTML/single-file apps.

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
- No address-management page (web /account/addresses, mobile add address).
- Recall returns/refunds and settlement deductions for returns are manual.
- Mobile cannot open invoice PDFs: needs a short-lived signed invoice URL from the API.
- WhatsApp channel not wired; GSTR-8 filing manual; Razorpay mandates untested.

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
Owner data and credentials (legal settings, API keys, S3, Razorpay, MSG91), lawyer/CA
sign-off on the rulebook, address management page, returns and refunds flow, Flutter build.

## Session history
| Date | Change |
| --- | --- |
| 2026-02-14..17 | Kilo prototype (Next.js, mock data) |
| 2026-03-30 | v2 package produced in Claude chat (not in Git) |
| 2026-09-30 | v2 imported; compliance rulebook drafted; owner decisions logged; Sprint 1 registration/KYC built and tested |
| 2026-09-30 | Standing rules (server SSOT, modular); Sprint 2 backend + web SSOT |
| 2026-09-30 | Sprint 3 backend: marketplace, allocation, settlements, refills |
| 2026-09-30 | Sprint 4: pharmacist gate, H1 register, invoices, price checks, grievances, recall, privacy |
