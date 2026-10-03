# Security review — Sprints 35 to 40

Date: 3 October 2026 (Sprint 41). Reviewer: the developer (Claude), from the code on branch
`claude/dawabag-pharmacy-status-0h7mr3`. Scope: everything added in Sprints 35–40 on the
backend, the website and the deployment — the pharmacist check on every order, OTP password
reset and sign-in by code, medicine-information four-eyes, category / HSN merge, partner API
keys, the stock feed and live snapshots, the emergency stop, the H1 and audit hash chains, the
maintenance-bypass lockdown, frozen prescriptions and the dispense ledger, authorise-then-capture
payments and the hold-expiry job, online-sale status, pharmacist registrations, partner batch
provenance, GDP holds, product class, recall drills, self-inspections, chain heads and
`SMS_NOT_CONFIGURED`. The mobile app was not reviewed (another workstream).

Earlier reviews: Sprint 6 (money and access), Sprints 12–13 (in Sprint 14), Sprints 15–20 (in
Sprint 21), Sprints 25–33 (`review-sprint25-33.md`, in Sprint 34). Rule numbers (C-xx) are from
the Dawabag Regulatory Compliance Rulebook.

## Summary

| Severity | Found | Fixed in Sprint 41 | Left (reason below) |
| --- | --- | --- | --- |
| High | 0 | — | 0 |
| Medium | 5 | 5 | 0 |
| Low | 16 | 10 | 6 |
| Information (checked, no issue) | 12 | — | — |

Every fix has a test: jest (`*.test.ts` named below) and `backend/test/sprint41.smoke.mjs`
(sections A–E, against the running API, which in this run connects as the restricted login).
The capture-race checks (C) were run against the old code first and failed there (a capture
after the release, and two gateway captures), then pass with the fix.

## Findings

Line numbers are after the fix.

| # | Severity | Where | Issue | Fix | Status / test |
| --- | --- | --- | --- | --- | --- |
| 1 | Medium | `backend/src/controllers/auth.controller.ts:291` (`/auth/verify-otp`), `controllers/passwordReset.controller.ts:31`, `services/otp/otp.service.ts` | **Wrong codes were counted only on "Forgot password".** Sprint 35 added a five-wrong-codes limit to `/auth/reset-password`, but sign-in by code (`/auth/verify-otp`, offered on the sign-in page since Sprint 35) accepted unlimited guesses of the same 6-digit code per mobile — only the address limit (20 auth requests / 15 min per IP) applied, so guesses spread over many addresses could take over an account; alternating the two endpoints also reset nothing. C-41, C-44. | One OTP service: `checkOtp()` counts wrong codes per mobile for every caller (`otp_wrong:<mobile>`, 15 min); the fifth throws the code away ("Too many wrong codes. Ask for a new code."). Constant-time comparison; a code is used once. | Fixed. `services/otp/otp.test.ts`; smoke B "wrong codes are counted per mobile across /auth/verify-otp and /auth/reset-password" |
| 2 | Medium | `controllers/auth.controller.ts:485` (`/auth/send-otp`), `:257` (register), `:386` (unverified login); `services/otp/otp.service.ts` | **No limit on codes sent to one mobile.** "Forgot password" and sign-in by code send an SMS to any number typed in, answered the same for every number: anyone could flood a stranger's phone and run up the SMS bill (DLT-registered sender), and each new code restarted the guessing window of #1. | `takeOtpSendSlot()`: one code per mobile every `OTP_SEND_MIN_GAP_SECONDS` (30) and `OTP_SENDS_PER_HOUR` (5), counted **before** the account lookup — 429 `OTP_SEND_LIMIT` "Please wait N seconds", identical for registered and unknown numbers (no account probing). Register and the unverified-login resend skip the SMS instead of failing. Dev / CI raise the limits in `scripts/dev-env.sh`. | Fixed. `otp.test.ts`; smoke B (gap, hourly limit, same answer for an unknown mobile) |
| 3 | Medium | `backend/src/services/payments/rxHold/hold.service.ts:148` (`captureHeldPayment`), `payments/capture.service.ts` (`applyCaptureTx`) | **A held payment's capture could cross a cancellation; two callers could both capture.** The readiness check committed before the gateway call, so a buyer's cancel, a refusal or the 72 h hold-expiry job could release the hold while the capture was in flight: the buyer was charged and then refunded — against the owner's rule that a buyer whose order does not go ahead is never charged (C-37). The pharmacist's release and the `payment_hold_watch` job could also both ask Razorpay to capture. | The whole capture — readiness, the gateway call (bounded to 20 s) and recording it — runs under the **order's row lock**, which `cancelOrder` takes first too. A cancellation now either comes first (nothing is captured, the hold is released) or waits for the capture to be recorded (then it refunds as for any paid order); a second capturer finds the payment captured and makes no gateway call. | Fixed. Smoke C (with a slow fake gateway): no `payment_after_close_refunded` for a crossing cancel, exactly one gateway capture with the check and the watch job at once, cancel-first releases without a capture |
| 4 | Medium | `deploy/staging/compose.yml` (`api`, `migrate`), `backend/src/db/appLogin.ts`, `backend/src/index.ts:256`, `services/system/configWarnings.ts` | **The API connected as the database owner** (`POSTGRES_USER`, a superuser in the staging / trial container) — the open Sprint 38 follow-up. That login can `ALTER TABLE … DISABLE TRIGGER`, `TRUNCATE` the H1 register, audit log or dispense ledger (row triggers do not fire on TRUNCATE) and `SET ROLE dawabag_maintenance`, so a flaw in the API could undo every record-finality rule. C-34, C-46. | Migrations run in a one-shot `migrate` service as the owner, which also creates or corrects the API's own login (`DB_APP_LOGIN`, default `dawabag_api`): LOGIN, no superuser / createrole / createdb / bypassrls, member of `dawabag_app` only (other memberships revoked), password sent as a SCRAM verifier (never in plain text). The API container gets only that password (`DB_PASSWORD` is replaced, so it never holds the owner's). The API logs which login it uses, warns on the admin dashboard (`DB_LOGIN_NOT_RESTRICTED`) and **refuses to start with `APP_ENV=production`** when not restricted. Jobs and Bull queues run in the API process on the same login; the demo seed / removal and the retention purge are covered (below). | Fixed. `db/appLogin.test.ts`; smoke A (role attributes, membership, refusals: SET ROLE, ALTER TABLE, TRUNCATE, DELETE audit with the switch on, CREATE; purge function allowed; six jobs succeed; the runner removes a stray membership; reserved name / weak password refused). The whole 1–41 suite runs with the API on this login |
| 5 | Medium | `deploy/staging/backup/backup.sh`, `backup/heads.sql`, `backup/s3.mjs` (`chainHeads`, `heads`), `deploy/staging/restore.sh` | **The recorded chain heads existed only inside the database.** The nightly `chain_verify` job (Sprint 40) catches a chain cut short by comparing with the head it recorded last time — but `chain_heads` lives in the same database, and the API role may insert rows there, so whoever could rewrite the newest entries could also add a matching "ok" head. The RUNBOOK asked to note the audit head with the monthly backup by hand. C-09, C-46. | Every backup reads the audit head and every H1 register's head **just before** `pg_dump` and stores them with the dump: object metadata (`chain-audit-head`, `chain-h1-registers`, `chain-heads-sha256`) and the full list as `<key>.heads.json` beside it (same encryption and retention). `restore.sh` checks the list against the checksum in the dump's metadata and that every recorded head is present, unchanged, in the restored database — else `RESTORE FAILED`. | Fixed. Smoke E (the heads query names the audit head and the registers); run by hand against a MinIO store: backup, restore check passes, a changed `heads.json` fails the restore |
| 6 | Low | `backend/src/db/appLogin.ts` (`ensureAppLogin`) | Found while doing #4: `restore.sh` restores with `--no-owner --no-privileges`, so after a restore `dawabag_app` would have no table privileges (the restricted API could not read anything) and the purge function would no longer belong to `dawabag_maintenance` (the retention purge would be refused by the triggers). | The owner's run (the `migrate` service, before the API starts) re-creates the NOLOGIN roles if missing, re-grants table / sequence privileges and default privileges, and gives the purge function back to `dawabag_maintenance`. | Fixed. `appLogin.test.ts`; RUNBOOK §6 "Restore drill" |
| 7 | Low | `backend/src/middleware/errorHandler.ts:15` | Error-log redaction did not cover the personal details added in Sprints 35–40: prescriber and patient addresses (H1 register), registration numbers, supplier licence and bill numbers. C-41. | Added to the redacted keys. | Fixed. `middleware/errorHandler.test.ts` |
| 8 | Low | `backend/src/services/gdp/disposition.service.ts:25` | A partner deciding an excursion by id locked the batch (and answered 409 "already decided") before checking that the excursion was its own; another partner's or Dawabag's excursion ids (UUIDs) are not guessable, but the lock and the different answer were unnecessary. | Ownership is checked first: "Excursion not found" (404) before anything is locked or said. | Fixed. Smoke E (partner on Dawabag's decided excursion → 404) |
| 9 | Low | `controllers/auth.controller.ts` (register, unverified login) | Codes sent at sign-up and on an unverified login came from `Math.random()` (sign-in codes already used `crypto.randomInt`); since Sprint 35 any of these codes can also set a new password. | All codes from `generateOtp()` (`crypto.randomInt`). | Fixed. `otp.test.ts` |
| 10 | Low | `controllers/passwordReset.controller.ts:36` | "Forgot password" changed the password of a switched-off account (no access followed — `authenticate` refuses it — but an admin's deactivation was silently modified). | A switched-off account gets the same answer as a wrong code and nothing changes. | Fixed. Smoke B |
| 11 | Low | `backend/src/index.ts:154` | Every route parsed JSON bodies up to 10 MB before any sign-in check (the limit Sprint 37's snapshots needed). | 1 MB for every route (`JSON_BODY_LIMIT`); 10 MB only under `/api/v1/partner-feed` (which also has the per-address upload limit and the per-key limits). | Fixed. Smoke E (1.2 MB to `/auth/login` → 413; to the feed → read, then 401 without a key) |
| 12 | Low | `backend/src/services/chainVerify/heads.service.ts:68` | `POST /admin/chain-heads/verify` started a full walk of every chain on each click; several at once could load the database. | One check at a time (Redis lock, released after the run): 409 `CHAIN_CHECK_RUNNING`. The nightly job takes the same lock. | Fixed. Smoke E |
| 13 | Low | `backend/src/services/partnerLiveFeed/checks.service.ts:85` | One update of a partner batch from an accepted feed check was keyed by `partner_product_id` without the partner id. The id comes from the partner's own locked check row (no path to another partner), so hardening only. | `AND partner_id = $6`. | Fixed (no behaviour change; covered by Sprint 37 smoke) |
| 14 | Low | `backend/src/services/selfInspection/register.service.ts:167` | The corrective-action owner list fell back to a staff member's mobile number when no name was recorded. C-41 (minimum necessary). | Falls back to "Staff member (role)". | Fixed. Smoke E |
| 15 | Low | `backend/src/scripts/demo/remove.ts` | `trial.sh unseed` failed once a demo admin had run a job by hand (`job_runs.triggered_by`). Found while checking the seed and removal as the owner. | The link is cleared like the other "touched by a demo person" columns. | Fixed (run by hand on the compose stack) |
| 16 | Low — **left** | `controllers/passwordReset.controller.ts` | Staff, admin and partner logins can reset their password with an SMS code alone (SIM-swap risk for the most powerful accounts). | Left (owner decision): recommend a second factor (authenticator app) for super-admin / admin logins before real customers; until SMS is configured the trial has no code reset at all. | — |
| 17 | Low — **left** | `services/otp/otp.service.ts` | One code per mobile serves sign-in, mobile verification and password reset (not scoped by purpose). | Left: sign-in by code already grants the same access as a reset; #1 and #2 bound guessing. | — |
| 18 | Low — **left** | `services/partnerApiKeys/keys.service.ts` | A partner's API keys stay valid when the owner login that issued them is switched off. | Left: keys belong to the partner, not to a person; the list shows who issued each one, and the admin or the new owner revokes it. | — |
| 19 | Low — **left** | `services/partnerApiKeys/keys.service.ts` (`refuse`) | Every refused call with a known key prefix writes an audit row. | Left: bounded by the per-address upload limit on `/partner-feed` (40 / 15 min) and wanted for C-46. | — |
| 20 | Low — **decision** | `services/chainVerify/heads.service.ts` (`chainStarts`), DECISIONS row "Nightly chain check…" | DECISIONS said `integrity.chain_start` is "a super-admin settings change"; the API has no schema for it, so only an operator can set it in the database. | Kept operator-only (stronger: a compromised super-admin cannot move a chain's start past a break); DECISIONS corrected; RUNBOOK §6 gives the audited SQL for after a restore. | — |
| 21 | Low — **left** | `backend/src/index.ts` (rate limiters) | The address-based limiters keep their counts in the API process; with more than one API process each counts separately. The OTP and partner-key limits are already in Redis. | Left: one API process on staging / trial; move the limiters to a Redis store when scaling out (RUNBOOK §8). | — |

## Checked, no issue found (information)

- **Authorisation on every new route.** Roles per route checked against the controllers: pharmacist
  check (`/fulfilment/shipments/:id/check` pharmacist_rx with a valid registration; partner check
  only for the partner's own shipment and active, verified `vendor_pharmacists` of that partner),
  medicine-information review (pharmacist_rx; authors refused by the service and the database
  check), catalogue merges (admins), emergency stop (pause / resume super-admin only; the public
  `/sales-status` returns state, reference and time, not the staff reason), chain heads and audit
  verify (admins), online-sale status (pharmacist_rx allows, admins / pharmacists stop),
  pharmacist registrations (admins; `me` pharmacist_rx), partner provenance (admins), GDP (store
  staff; disposition pharmacist_rx; partner routes scoped to `req.partner.vendorId`), recall drills
  (admins), self-inspections (staff; actions by owner or admin), config warnings (admins), API keys
  (admin any partner, partner owner its own).
- **IDOR across partners and buyers.** Partner GDP batches, excursions, provenance, H1 register
  (partner filter AND register key), feed checks, API keys (`WHERE id AND partner_id`), shipments,
  live snapshots (every write filtered by the key's partner) — no path to another partner's stock or
  registers. `prescription_id` on `POST /orders` must be the buyer's own (`attachPrescriptionTx`).
- **Webhooks.** `payment.authorized` / `payment.captured` act only after an HMAC-SHA256 check of the
  raw body (timing-safe, refused without a secret); events are de-duplicated by the body's hash,
  stale events (> 7 days) ignored, amounts compared with the payment row.
- **Partner API keys.** Only from `Authorization: Bearer`; SHA-256 + public prefix stored; constant-time
  comparison whether or not the prefix exists; scope and partner checked; query strings of feed
  calls never logged; per-key hourly limits in Redis; the key is never logged or audited.
- **Account probing.** `/auth/send-otp` (200 / 429 / 503 alike for every number), `/auth/reset-password`
  (one message for wrong code, unknown or switched-off account), login timing (dummy bcrypt, Sprint 34).
- **Maintenance bypass.** `dawabag_maintenance_active()` needs the role itself (SECURITY DEFINER
  function owned by it, or `SET ROLE`, which needs membership); with #4 the API login has neither.
- **Hash chains.** Sealed at commit under advisory locks; canonical text identical in SQL and
  `utils/hashChain.ts`; `chain_heads` append-only by trigger.
- **Snapshot vs. checkout.** Same lock order (product, batch) and retry on 40P01 / 40001 (Sprint 38).
- **CSRF.** State-changing routes need the `Authorization: Bearer` header (access token in memory);
  the refresh cookie is httpOnly, Secure, SameSite=Strict, scoped to `/api/v1/auth`; cookie-authenticated
  calls need `X-Client: web` (CORS preflight). `reset-password` issues the same cookie.
- **File uploads.** Live snapshots and stock files go through the Sprint 34 pipeline (in memory, zip
  guard, row limits, magic bytes for documents); recall-drill PDFs are generated on demand, never stored.
- **SQL.** Sprint 35–40 services are parameterised; interpolations found are constants (table and
  column names in the demo removal, enum words).
- **Errors.** Database messages reach clients only for our own trigger exceptions (P0001 / check
  violation without a constraint name) and the named constraints; anything else is "Internal server
  error" with a request id.

## Not in scope / follow-ups

- **Mobile app:** handle 429 `OTP_SEND_LIMIT` on `/auth/send-otp` (show the server's message, keep
  the code step) and the message "Too many wrong codes. Ask for a new code." on `/auth/verify-otp`
  and `/auth/reset-password`; nothing else changes for the app.
- **Owner:** second factor for admin logins (#16) before real customers; the approved cold-chain
  courier list (Settings) once couriers are contracted.
