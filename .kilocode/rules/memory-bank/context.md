# Active Context

## Current state (2026-09-30)
The February Kilo Next.js prototype was replaced by the Dawabag v2 package
(built in a Claude chat, 30 Mar 2026). Sprints 1–6 are done on branch
`claude/dawabag-pharmacy-status-0h7mr3`; beta now waits mainly on owner data, keys and
the lawyer/CA sign-off.

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
- Refunds through Razorpay untested (no keys; legs wait for accounts). Replacement = new order.
- Backend uses AWS SDK v2 (end of support): move to v3 before launch.
- Web Docker image not yet built here (Docker Hub rate limit); API image built and run.
- External penetration test pending (internal review done, 12 findings fixed).
- Policy texts must be published by the owner.
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
Owner data and credentials (legal settings, licence register, policy texts, API keys, S3,
Razorpay, MSG91), lawyer/CA sign-off on the rulebook and Sprint 5 defaults, Flutter build,
deployment per docs/Dawabag_Beta_Deployment_Guide.docx.

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
