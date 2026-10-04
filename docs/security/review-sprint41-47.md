# Security review — Sprints 41 to 47

Date: 4 October 2026 (Sprint 48). Reviewer: the developer (Claude), from the code on branch
`claude/dawabag-pharmacy-status-0h7mr3`. Scope: everything added in Sprints 41–47 on the backend,
the website and the deployment — the restricted database login and `migrate` service, sign-in code
limits, the held-payment capture lock, backup chain heads, approved cold-chain couriers; the frozen
sale identity; two-step sign-in (enrolment, challenges, recovery codes, replay, attempt limits, key
handling, refresh gating, super-admin reset); the Sprint 43 quality-sweep fixes (signed-out refresh
answering 200); order changes before the invoice (second payments with `order_edit_id`, refunds after
the capture, credit bills, and the races between a change, the pharmacist's approval, the payment
capture, the hold-expiry job and a cancellation); the invoice issued at the approval; sales to doctors
(registration verification, certificate and written-order uploads, signed links, viewers, the
in-app signature's password limit); health-profile encryption; the medicine-information and
catalogue-suggestion imports; who may buy a product (every path a buyer can obtain one); and
`QUEUE_PREFIX`. Every CSV export was checked for formula injection. The mobile app was not reviewed
(another workstream); the API changes it must follow are listed at the end.

Earlier reviews: Sprint 6, Sprints 12–13, 15–20, 25–33 (`review-sprint25-33.md`), 35–40
(`review-sprint35-40.md`, status of its open items below). Rule numbers (C-xx) are from the Dawabag
Regulatory Compliance Rulebook.

## Summary

| Severity | Found | Fixed in Sprint 48 | Left (reason below) |
| --- | --- | --- | --- |
| High | 1 | 1 | 0 |
| Medium | 3 | 3 | 0 |
| Low | 11 | 5 | 6 (decisions recorded) |
| Information (checked, no issue) | 14 | — | — |

Every fix has a test: jest (`*.test.ts` named below) and `backend/test/sprint48.smoke.mjs`
(sections A–B, against the running API connected as the restricted login `dawabag_api`). The smoke
checks were run against the old code first: **19 of them failed there** (two payments for one change
both accepted and the money short by the change's amount; approvals that did not wait for the order
lock or noticed a change; an approval for a suspended doctor; parallel guesses all checked; a reset
that left sessions open; a pharmacist deciding a registration), and all pass with the fixes.

## Findings

Line numbers are after the fix.

| # | Severity | Where | Issue | Fix | Status / test |
| --- | --- | --- | --- | --- | --- |
| 1 | **High** | `backend/src/services/orderEdit/extraPayment.ts:49` (`stillOwed`), `:60` (`recordEditAuthorisationTx`), `:83` (`recordEditCaptureTx`); `services/payments/capture.service.ts` (`captureEditPayment`) | **One order change could be paid — and then refunded — twice.** A buyer may open several gateway orders for the same "pay the difference" (two tabs, a retry); every one is allowed while the change is `awaiting_payment`. For an order holding prescription medicines (authorised, captured after the check) the authorisation path accepted a payment for a change already `authorised`, so **both holds were kept and later captured**. A later lowering change then counted both payments as paid (`committedPaise`) and promised a refund of twice the difference; at the capture the surplus payment was also refunded as "no longer owed". Net: the buyer paid the order's value **minus** the difference — repeatable by anyone with two browser tabs (double money movement, C-37, C-30). | A change is paid by ONE payment. An authorisation is accepted only while the change is still `awaiting_payment` (any further one is released at once, 409 to the buyer); a capture counts only for an `awaiting_payment` change, or for an `authorised` one when this very payment holds the authorisation — anything else is refunded at once. The check locks the order first, then the change row (the same lock order as an order change, a cancellation and a capture — no deadlock). | Fixed. Smoke A1: two payments for one change → the second `released`, never captured; after removing the added medicine and the capture, captured − refunded = the order's value |
| 2 | Medium | `services/pharmacistCheck/check.service.ts:40` (`lockOrderOfShipment`), `:57` (`assertUnchangedSinceShown`), `:319`; `pharmacistCheck/partner.service.ts:47`; `services/rxVerification.service.ts:81`, `:97`, `:178`; `controllers/fulfilment.controller.ts` / `partner.controller.ts` (`edits_seen`) | **A pharmacist's approval could cross the buyer's order change.** The approval locked only the parcel (shipment), while a change locks the order and then its parcels. Run together, the approval waited for the change's parcel lock and then **approved and invoiced lines the pharmacist never saw**; and a prescription review that had already passed its "every prescription line covered" check could then release a parcel holding a prescription medicine the buyer had just added without a prescription (C-08, r.64(2)). Without any race, a check screen opened before a change still approved the changed order. | Every approval path — Dawabag's and a partner's pharmacist check, the prescription review and the reuse of a verified prescription — locks the ORDER row first (as a change, cancellation and capture do). The check queue, the order's check page and the partner's shipment list return `edits_count`; the website sends it back as `edits_seen`, and an approval of an order changed since it was shown answers **409 `ORDER_CHANGED`** ("reopen and check again"). | Fixed. Smoke A2: with the order row held by another session each approval (own check, partner check, prescription review) waits for it, then approves the current order; a release with a stale `edits_seen` → 409, nothing invoiced |
| 3 | Medium | `services/pharmacistCheck/check.service.ts:202` (`assertBuyerEligibleAtSaleTx`, called from `assertReleasableTx`) | **The buyer's standing was checked at placement only, but the sale happens at the approval.** Since Sprint 44 the tax invoice is issued when the pharmacist approves; a doctor whose council registration lapsed or was suspended in between, or a buyer who no longer qualifies for a product restricted to doctors / hospitals or licensed trade (Sprint 47 — e.g. restricted after the order was placed), was still invoiced and supplied (r.65(9)(b); C-14, C-33). | At every approval (in the same transaction that issues the invoice) the doctor's registration standing and every restricted line are checked again with the buyer's live standing: **409 `BUYER_NOT_ELIGIBLE`** with the reason; the pharmacist holds the order or refuses it (refunded). | Fixed. Smoke A3: product restricted after ordering → 409, no invoice, refusal refunds; doctor suspended before approval → 409, no invoice |
| 4 | Medium | `utils/attemptCounter.ts`; `services/otp/otp.service.ts:72` (`CHECK_OTP_SCRIPT`), `:85`; `services/twoFactor/challenge.ts:54`, `enrolment.service.ts:38` (`takeTry`); `services/practitionerSales/writtenOrder.service.ts:101` | **Attempt limits could be bypassed by sending guesses in parallel.** Sign-in codes (Sprint 41), authenticator codes (Sprint 42) and the written-order signature password (Sprint 44) each read the wrong-try count, checked the guess and only then counted it. Parallel requests all passed the "fewer than five" check before any was counted (the old code checked 8+ authenticator codes in one burst in the test; a guesser spread over addresses could make hundreds per window). C-41, C-44. | Each try now takes its number **before** the guess is checked, in one Redis step (INCR with the window's expiry set in the same script, so a counter can never be left without one); a try over the limit is refused unchecked; a right answer clears the count. The sign-in code check is a single Redis script (compare, use up or count, throw the code away at the fifth). | Fixed. `services/otp/otp.test.ts` (parallel guesses with the right code among them: never accepted); smoke B1 (20 parallel codes → exactly 4 "too many"), B2 (10 parallel authenticator codes → 5 checked, 5 refused unchecked, audit attempts 1–5), B4 (10 parallel passwords → 5 checked, 5 refused) |
| 5 | Low | `database/43_sprint48_session_revocation.sql`; `services/twoFactor/enrolment.service.ts:243`; `utils/jwt.ts:103` (`sessionEndedMessage`); `middleware/auth.middleware.ts:79`, `:121`; `controllers/auth.controller.ts:429` | A super-admin's reset of someone's two-step sign-in (the lost-phone case) left every session that person already had working — a two-step session is renewed for as long as it is used, possibly on the lost phone. | The reset sets `users.sessions_revoked_at`; access and refresh tokens issued before it are refused (401 "Your session was ended by Dawabag. Please sign in again"), the same check as a password change. Audit `two_factor_reset_by_admin` records `sessions_ended`. | Fixed. `utils/sessionRevocation.test.ts`; smoke B3 |
| 6 | Low | `backend/src/routes/kyc.routes.ts:41`; `frontend-web/src/components/admin/kyc/DecisionPanel.tsx` | Sprint 44 made doctor registration decisions admin-only (`/practitioner-sales/practitioners/:id/registration`), but the older `POST /kyc/admin/verify-nmc` (same decision, same service) still accepted `pharmacist_rx`. | Admins and super-admins only; the KYC page shows pharmacists a note instead of the form. | Fixed. Smoke B5 |
| 7 | Low | `services/orderEdit/edit.service.ts:178` | A trade buyer's credit order whose bill was already settled could still be made larger: the extra was added to the buyer's credit used against a bill nobody collects (only lowering had a settled-bill path). | 409 `ORDER_EDIT_CREDIT_SETTLED` ("place a new order for more"). | Fixed. Smoke A4 |
| 8 | Low | `services/healthProfile/reseal.service.ts:22`, `:34` | Start-up sealing / re-sealing (Sprint 43) (a) overwrote a row without checking it was unchanged — the API may already be serving a buyer who saves new details; (b) stopped at a page made only of rows this server cannot open, so readable rows after it stayed plain / on the old key. | Pages by key (`user_id > last`), and each UPDATE applies only if the row is still as read (`ROW(...)::text` compare). | Fixed. Smoke B6 (plain row sealed at start-up, an unknown-key row left as it was, reads back) |
| 9 | Low — **decision** | `services/twoFactor/enrolment.service.ts` (`takeTry`) | With #4 a try is counted before it is checked, so requests that fail for another reason (e.g. 409 `TWO_FACTOR_KEY_CHANGED` after a key change, or "already on") also use one of the five tries. | Kept: simpler and safer than deciding which failures "count"; a person in that situation uses a recovery code or asks a super-admin. | — |
| 10 | Low — **left** | `services/rxVerification.service.ts` | The prescription review is serialised with order changes (#2) but does not carry an `edits_seen` count; a buyer adding an OTC line between the moment the pharmacist opened the prescription and pressed Verify has that line released with Dawabag's parcel by the review. | Left: prescription lines cannot change once a prescription is checked, the change is shown on the order page, and the line is OTC; follow-up — send `edits_seen` from the prescription screen too. | — |
| 11 | Low — **left** | `controllers/auth.controller.ts` (`refreshToken`) | Refresh-token rotation checks the blacklist and blacklists in two steps: two refreshes with the same token at the same instant both succeed (pre-existing, Sprint 34). | Left: making it strict would sign out a person with two tabs refreshing together; tokens are short-lived and httpOnly / keychain-held. | — |
| 12 | Low — **left** | `services/practitionerSales/registration.service.ts` (`decideRegistration`) | The certificate copy recorded at verification is whichever the doctor uploaded last; a doctor replacing it between the admin viewing it and pressing Verify gets the new one recorded. | Left: the upload is the doctor's own and audited; the admin opens the copy from the same row just before deciding. Follow-up — pass the viewed document id with the decision. | — |
| 13 | Low — **left** | `utils/documentCheck.ts` (`sniffDocumentType`) | A file is taken as PDF when `%PDF-` appears anywhere in its first 1 KB (scanners add junk), so a crafted HTML/PDF polyglot is accepted. | Left: it is stored and served from the private object store with the checked type `application/pdf` (5-minute links), never as HTML. | — |
| 14 | Low — **left** | `utils/zipGuard.ts`, `services/medicineInfo/importDrafts/workbook.ts` (`readXlsxSheet`) | An import workbook may unpack to 60 MB; the Excel reader builds it fully in memory (several hundred MB for a crafted file). | Left: staff-only routes (pharmacist / admin), upload limiter, 10 MB file and 5,000-row limits, zip-bomb guard; revisit if partners ever upload workbooks. | — |
| 15 | Low — **left** | `services/payments/rxHold/hold.service.ts` (`runRxHoldWatch`) | An unpaid "pay the difference" does not time out (owner decision CONFIRMED 2026-10-04), but the order's own held payment still ends after the hold time and that cancels the whole order. | Left as designed (the bank's authorisation expires); documented in RUNBOOK §7h. | — |

### CSV exports (task 3)

Every CSV the API builds — the H1 register (`controllers/h1Register.controller.ts`), sales to doctors
(`practitionerSales.controller.ts`), the destruction register (`stockControl.controller.ts`), the
accounts reports (`accounts.controller.ts`) and the import result lists ("not in catalogue",
"no draft yet") — goes through `utils/csv.ts` `toCsv`, which already prefixes a cell starting with
`=` `+` `-` `@`, tab or carriage return with `'` (plain numbers, also negative, are left alone) and
quotes cells with commas, quotes or new lines. The website builds no CSV itself (it saves the
server's text). No change was needed; a dedicated unit test was added: `utils/csv.test.ts`.

## Checked, no issue found (information)

- **Invoice at approval.** `next_invoice_number` takes the series row lock (`INSERT … ON CONFLICT DO
  UPDATE`) inside the release transaction — gap-free under concurrency, a rolled-back release gives the
  number back; CHECK `released ⇒ invoiced` and the trigger on `pharmacist_check` make a release without
  an invoice (or an INSERT as released) impossible; amounts and lines are final once invoiced.
- **Held-payment capture vs. cancellation / hold-expiry job / second capturer** (Sprint 41 #3): still
  under the order lock; order changes take the same lock; refunds promised "after the capture" wait for
  the last hold and are closed (`not_needed`) when a cancellation releases the holds.
- **Restricted database login.** The API (and every test-spawned API) runs as `dawabag_api`; the whole
  smoke suite 1–48 passed that way; Sprint 48's migration needs no new grant.
- **Two-step sign-in.** Secrets AES-256-GCM with the user id as associated data; recovery codes as
  HMAC with a derived key; each code once (newest step kept, under a row lock); challenges single-use
  (GET+DEL in one Redis script), 5 / 15 minutes; refresh refuses a session without the second step once
  it applies; `TOTP_ENC_KEY` required with `APP_ENV=production`; super-admin reset needs a reason and is
  audited; nothing secret logged or audited.
- **Signed-out refresh (Sprint 43).** 200 `data: null` only for the website (`X-Client: web`) without a
  cookie; any token problem is still 401 and clears the cookie; no account data in the answer.
- **Sales to doctors.** Written orders: upload checked by content (PDF / JPEG / PNG, 5 MB, declared type
  must match) into the private object store with its SHA-256; viewers are the buyer, Dawabag staff and
  a partner selling part of that order; links 5 minutes (object store presign / HMAC-signed API path
  with expiry), every link audited; certificate key never returned; final by trigger.
- **Health details.** AES-256-GCM, row bound as associated data (`table:id`), key id per value for
  rotation (`HEALTH_ENC_KEY_PREVIOUS`), required in production; unreadable values give a plain 500 with
  no detail.
- **Imports (Sprints 45–46).** Pharmacist / admin roles only; partner chosen from real partners and
  matching limited to that partner's links (no cross-partner attach); zip-bomb guard, 10 MB, 5,000 rows,
  extra columns reported; formulas are read as their cached text and never evaluated; nothing becomes
  live without a pharmacist (drafts / suggestions); audit records counts, file hash and ids — no content.
- **Who may buy (Sprint 47).** Enforced at placement and preview, refills (via `placeOrder`; new
  subscriptions filtered), cart add / raise, order-change adds and raises, and now at the approval
  (#3); search, product pages and substitutes label it; partner allocation runs only after the check;
  there is no admin-created order path.
- **Order changes.** Buyer-only (`o.user_id = $2` under the lock); quantities and adds re-checked as at
  checkout (online-sale status, Schedule X / NDPS, limits, emergency stop, prescriptions, written orders).
- **Cold-chain couriers.** Checked at Dawabag's and partners' dispatch (409
  `COLD_CHAIN_COURIER_NOT_APPROVED`), warning while the list is empty.
- **Frozen sale identity.** Recorded in the release transaction; triggers keep it final; maintenance
  bypass needs the NOLOGIN role the API login does not have.
- **`QUEUE_PREFIX`.** Validated in `config/env.ts`, logged at start-up, per-stack in dev / tests.
- **Mass assignment / injection.** New routes parse bodies with zod to named fields; new SQL is
  parameterised (interpolations are constants).
- **Errors and logs.** New 409 codes carry plain sentences only; Redis scripts and codes never logged.

## Open items from the Sprints 35–40 review

| # (35–40) | Status after Sprint 48 |
| --- | --- |
| 16 SMS-only reset for admin logins | **Mitigated, still waiting for the owner's switch.** Two-step sign-in is built for every staff and partner login (owner CONFIRMED 2026-10-04 that it applies to ALL partner logins). Closed when Settings → "Two-step sign-in" is set to `required` after every admin has enrolled (launch checklist). |
| 17 codes not scoped by purpose | Left (unchanged reasoning); guessing now strictly bounded (#4). |
| 18 partner keys survive the issuer's deactivation | Left (unchanged). |
| 19 refused-key audit rows | Left (unchanged). |
| 20 `integrity.chain_start` operator-only | Decision unchanged. |
| 21 in-process address limiters | Left; one API process on staging / trial (RUNBOOK §8 when scaling out). |
| Mobile follow-up: 429 `OTP_SEND_LIMIT` and "Too many wrong codes" | Not confirmed in the app code (no handling of `OTP_SEND_LIMIT` found by name) — app team to check that the server's message is shown. |

## API changes for the mobile app

- `POST /payments/verify` for an order change already paid by another payment answers **409** (the
  payment is released / refunded) — show the server's message and reload the order.
- Pharmacist checks are not done in the app; if added, send `edits_seen` (the `edits_count` shown) with
  `POST /fulfilment/shipments/:id/check` or `POST /partner/shipments/:id/check`; handle 409
  `ORDER_CHANGED` and 409 `BUYER_NOT_ELIGIBLE`.
- Any authenticated call may answer **401 "Your session was ended by Dawabag. Please sign in again"**
  after a super-admin reset of the person's two-step sign-in — treat like any other 401 (clear the
  session, go to sign-in).
- `POST /orders/:id/edit` may answer 409 `ORDER_EDIT_CREDIT_SETTLED` (show the message).
- `POST /written-orders/requisition` 429 `WRITTEN_ORDER_SIGN_PAUSED` is unchanged in shape; it may now
  come after fewer requests sent at once.
