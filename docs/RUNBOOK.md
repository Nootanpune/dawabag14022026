# Dawabag — deployment and operations runbook

For the developer who deploys and runs Dawabag. Supersedes the deployment steps in
`Dawabag_Beta_Deployment_Guide.docx` where they differ (that guide predates the
migration runner and the Docker images). Owner decisions: `DECISIONS.md`; legal rules:
the Compliance Rulebook (C-xx).

## 1. What runs

| Piece | Image / source | Notes |
| --- | --- | --- |
| API | `backend/Dockerfile` (build from repo root) | Node 20, port 4000; on staging / trial a one-shot `migrate` container (same image) applies DB migrations as the owner first, then the API connects as its own restricted login (Sprint 41) |
| Website | `frontend-web/Dockerfile` | Next.js standalone, port 3000; `NEXT_PUBLIC_API_URL` is baked in at build |
| Database | PostgreSQL 16 (AWS RDS, ap-south-1) | the only record of truth |
| Cache / queues | Redis 7 (ElastiCache) | OTPs, rate limits, job locks — nothing that must survive |
| Files | S3 bucket in ap-south-1, public access blocked, SSE on | KYC documents, prescriptions |
| Mobile app | `mobile/` (Flutter) | build on a machine with the Flutter SDK |

Standing rules: nothing is stored on app servers, browsers or phones (logs go to
stdout); all data stays in India (ap-south-1, C-44).

## 2. Configuration

Copy `backend/.env.example` and fill every key. In `NODE_ENV=production` the API
**refuses to start** if a secret is missing, still has the example value, is shorter
than 32 characters, if Razorpay / S3 / MSG91 / SES keys are missing, if
`CORS_ORIGINS` is empty or `AWS_REGION` is not `ap-south-1`. The log says exactly
what is wrong. Generate secrets with `openssl rand -hex 48`.

`QUEUE_PREFIX` (Sprint 47, optional) names this deployment's background job queues
(notifications, e-invoices) in Redis. Every API process with the same Redis **and** prefix
shares the queues — right for replicas of one deployment. Two different stacks on one Redis
(e.g. a trial and a staging server, or two local test stacks) must use different prefixes,
or one sends the other's messages with its own settings and database. Unset = `bull`
(unchanged, so waiting jobs are kept on an upgrade); `scripts/dev-env.sh` sets
`dawabag-api-<PORT>` per local stack and test-spawned APIs use their own. The API logs
`Redis connected (job queues under prefix "…")` at start-up.

`APP_ENV` names the deployment: set **`APP_ENV=production`** on the real production
servers — the API then also refuses `ALLOW_MISSING_INTEGRATIONS`, `S3_ENDPOINT`,
`DEMO_SEED`, `TRIAL_DEMO_PASSWORD` and `DEMO_PAYMENTS` outright. Unset (or `staging`) keeps the staging
rules; `trial` is only for the owner's demo server (section 7e) and needs
`ALLOW_MISSING_INTEGRATIONS=true`; Razorpay test keys are optional there. Without them a
trial offers a labelled **demo payment** (`GET /payments/options` → `mode: demo`,
`POST /payments/demo`, `POST /consultations/:id/pay/demo`): no money moves, the order is
marked paid through the same capture code as Razorpay (payments.gateway = `demo`, ids
`demo_order_…`/`demo_pay_…`, audit `demo_payment_*` with `demo: true`), and refunds of demo
payments are settled at once without a gateway. `DEMO_PAYMENTS=false` turns it off; the
API refuses `DEMO_PAYMENTS` anywhere but `APP_ENV=trial`, and the routes answer 404 there. `S3_PUBLIC_ENDPOINT` (with
`S3_ENDPOINT` only) is the https address of a self-hosted store that browsers use;
signed links are made for it while the API itself talks to `S3_ENDPOINT`.

Razorpay: dashboard → Webhooks → URL `https://<api-domain>/api/v1/payments/webhook`,
events `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`,
`token.confirmed`, `token.rejected`, `token.cancelled`; copy the secret to
`RAZORPAY_WEBHOOK_SECRET`. Enable automatic capture. Each event is acted on once (retries
are recognised by event id). Payments whose app confirmation and webhook were both lost
are picked up by the `payment_reconcile` job every 15 minutes. A refund the gateway
refuses or fails stays pending with the reason in Admin → Refunds: fix the cause and
press Retry, or refund by bank transfer and mark it processed with the UTR. The CA's
`payment-reconciliation` report (Accounts, up to 31 days) matches Razorpay's settlement
lines — fees, GST on fees, UTR — to Dawabag's payments and refunds and flags anything
missing or different. Before going live, run one real ₹1 payment, refund and mandate in
Razorpay test mode.

**Sign-in codes (Sprint 41).** At most one code per mobile every `OTP_SEND_MIN_GAP_SECONDS`
(30) and `OTP_SENDS_PER_HOUR` (5) — 429 `OTP_SEND_LIMIT` with a plain wait, the same for every
number; five wrong codes (sign-in by code and "Forgot password" together) throw the code away.
JSON bodies are limited to `JSON_BODY_LIMIT` (1 MB) except the partner stock feed (10 MB).

**Two-step sign-in (Sprint 42).** Super-admin, admin, pharmacist, packer and **every partner
login** can add an authenticator app (RFC 6238: SHA-1, 30 s, 6 digits, ±1 step; Staff → "My
two-step sign-in", Partner → "Two-step sign-in"). Enforcement is the super-admin setting
`security.two_factor` (Admin → Settings → "Two-step sign-in"): `optional` (default, until the
owner decides) or `required` — then anyone in those roles without it sets it up at the next
sign-in, and sessions opened without it stop at their next renewal (401
`TWO_FACTOR_SIGN_IN_REQUIRED`). Password, SMS code and "Forgot password" are only the first
step: no token or cookie before the code. Each code works once (newest step kept per login);
five wrong codes pause the second step for 15 minutes (429 `TWO_FACTOR_PAUSED`). Ten one-time
recovery codes per enrolment, stored as keyed hashes. **Key:** `TOTP_ENC_KEY` (≥ 32 random
characters, e.g. `openssl rand -hex 32`) encrypts the app keys (AES-256-GCM) and keys the
recovery-code hashes; **required with `APP_ENV=production`**. Without it staging / CI derive a
key from `JWT_REFRESH_SECRET` (dashboard warning `TOTP_KEY_NOT_SET`); the trial derives a stable
one from `DB_PASSWORD` in `deploy/trial/trial.sh` (no change to an existing `TRIAL_ENV`). Keep
the key stable and in the secret store: a new key makes every enrolled app unreadable — those
people sign in with a recovery code (409 `TWO_FACTOR_KEY_CHANGED` otherwise) or a super-admin
resets them (Admin → Two-step sign-in (all) → Reset, reason required, audited
`two_factor_reset_by_admin`). A reset after a lost phone: confirm the person's identity by a
call first. Since Sprint 48 a reset also **ends every session the person already had** (the
lost phone may hold one; `users.sessions_revoked_at`, migration 43): they sign in again. Wrong
codes are counted before they are checked, so parallel guesses cannot exceed the five. Audit actions: `two_factor_enrolled`, `two_factor_failed`, `two_factor_paused`,
`two_factor_recovery_code_used`, `two_factor_recovery_codes_renewed`, `two_factor_disabled`,
`two_factor_reset_by_admin`, `setting_changed` (the policy).

**SMS (MSG91, DLT).** Indian operators deliver only templates registered on DLT
(TRAI). Register each message in the DLT portal and MSG91, then map it in Admin →
Settings → SMS templates (message type → template id → variables). A message type
with no template is not sent by SMS; it is logged as *skipped* in Admin → Notification
deliveries, which also shows every failed SMS, email and push with the reason.
*Without MSG91 (Sprint 40)* — e.g. the trial — `POST /auth/send-otp` (sign-in by code and
"Forgot password") answers **503 `SMS_NOT_CONFIGURED`** with "Text-message codes are not
switched on yet. Please sign in with your password, or ask the admin to reset it." — the
same answer for every number. The admin dashboard shows the warning (also when
`MSG91_AUTH_KEY` is set but no OTP template is registered: set `MSG91_TEMPLATE_OTP` or the
`otp` entry of the SMS templates setting).

**Push (FCM HTTP v1).** Firebase console → Project settings → Service accounts →
Generate new private key; put the JSON (or its base64) in `FCM_SERVICE_ACCOUNT_JSON`.
Phones that uninstalled the app are removed automatically.

**Courier (Shiprocket).** Set `SHIPROCKET_EMAIL`/`SHIPROCKET_PASSWORD` (an API user)
and `SHIPROCKET_WEBHOOK_TOKEN`; in Shiprocket → Settings → API → Webhooks set the URL
`https://<api-domain>/api/v1/courier/shiprocket/webhook` and the same token. Create the
pickup address and put its name in Admin → Settings → courier pickup location, then
switch courier provider to *shiprocket*. Packers then book the AWB after packing; the
courier sees "Pharmacy items" only (C-41). A courier "delivered" scan closes
non-prescription parcels; prescription parcels still need the buyer's delivery code
(C-26) and admins get an alert to confirm. Returns to origin (RTO) alert admins once.
`*_BASE_URL` / `GOOGLE_OAUTH_TOKEN_URL` are for tests only; production refuses them.

**E-invoicing (IRP, C-31).** Needed once aggregate turnover crosses the e-invoicing
threshold (confirm the current limit with the CA). Register for API access on the IRP
(NIC or a private IRP), whitelist the server's outbound IP, and set the `IRP_*` keys.
Fill Admin → Settings → legal entity (GSTIN, legal name, address) and the premises PIN
code, then switch on `einvoice.enabled`. From then on every Dawabag B2B invoice is
registered when it is packed, and the parcel cannot be dispatched until its IRN is back;
credit notes are registered against their invoice. The IRN and signed QR print on the
invoice PDF. Problems appear in Admin → E-invoices: fix the data (usually a buyer GSTIN)
and press Retry. Corrections are made by credit note; IRNs are never cancelled from here.
**Teleconsultation (Telemedicine Practice Guidelines 2020, C-22..C-24).** Admin →
Doctors: enable a registered account by mobile number; the doctor fills in council,
registration number, qualification and year; check them on the NMC / State Medical
Council register before approving (any later change needs approval again). A pharmacist
classifies each medicine's telemedicine list (O, A, B or prohibited) — unclassified
medicines cannot be prescribed; Schedule X and NDPS are always prohibited. Set
`PUBLIC_WEB_URL` so the QR on e-prescriptions opens the public check page. The
consultation fee is paid by Razorpay; patients may cancel up to two hours before the slot
and are refunded in full. An e-prescription sent to Dawabag is verified by the
pharmacist like any upload.

Document numbers are at most 16 characters (CGST Rule 46): `DWB/2627/00012`,
credit notes `DWBC/2627/00001`; partner prefixes are 2–4 characters.

**Languages (C-40).** Publish each policy in English first (Admin → Policies), then its
Marathi and Hindi translations of the same version. Readers get their language when the
translation of the current version exists, otherwise English (marked as such). Consent
records the notice version and the language shown.

**Retention (C-44).** Admin → Settings → retention: days to keep delivery logs, inbox
notifications, payment webhook records (at least 180), job history, untouched carts and
unused phones. The `retention_purge` job deletes older rows daily and audits the counts.
Statutory records (invoices, credit notes, H1, prescriptions, e-invoices, receipts,
consent and audit logs) are never purged by it.

**Own riders (C-26, C-41).** Give each rider a `delivery` login. At dispatch the packer
picks either one of our riders or a courier; a rider shipment gets an AWB `DWR…`. A rider
sees only their own run sheet (no medicine names); riders cannot open or list orders or
invoices — the invoice travels inside the sealed pack. Reassign a dispatched parcel from the
fulfilment queue if a rider is unavailable.

**WhatsApp.** Set `MSG91_WHATSAPP_NUMBER` and map each notification type to an approved
MSG91 template in Admin → Settings → `whatsapp.templates` (`name`, `language`, `vars`).
Messages go only to customers who switched on WhatsApp updates (separate consent,
withdrawable any time); others keep SMS and push. Only order and account updates can be
sent on WhatsApp, with order number, status, AWB, courier, tracking link, amount, date,
delivery code, ticket or return number — never medicine names, prescription or recall
details (C-41).

**Recall alerts (C-28).** When CDSCO publishes its monthly NSQ list, or FDA Maharashtra or
a manufacturer sends a recall, enter it the same day in Admin → Recall alerts: upload the
list as .xlsx or .csv (columns: drug name, batch number, manufacturer, reason) or type the
lines in, with the time it was received. Every batch on the list is matched (letters and
digits only) against Dawabag and partner batches held or sold. Within 4 hours of receipt,
decide each match: **Recall** (blocks the batch, tells every buyer to stop using it) or
**Not this product** with a note. Admins are alerted at entry and again if the 4 hours
pass with matches undecided. A goods receipt, partner listing or opening stock of a batch
on any alert is refused until an admin clears it for that product (Recall alerts → the
line → "Clear a product refused at receipt").

**GST period lock (C-31).** After filing GSTR-1/3B for a month, set Admin → Settings →
`accounts.locked_until` to the last day of that month. Goods receipts and supplier
credit notes dated on or before it are refused; correct a filed month in the next
period's return.

**Video calls (C-23).** Consultations run on Agora; nothing is recorded. Each join gives a
token for that person and that channel for at most 30 minutes; the apps renew it while the
consultation is open, so a cancelled or ended consultation loses its call within 30
minutes.

**Go-live switches.** Turn off `catalogue.opening_stock_open` once opening stock is in:
afterwards stock enters only by goods receipt. Set `TRUST_PROXY_HOPS` to the number of
proxies in front of the API (1 behind an AWS load balancer, 0 if none; production refuses to
start without it) so rate limits see real
client addresses.

## 3. Build the images

```bash
docker build -f backend/Dockerfile -t dawabag-api .
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.dawabag.in -t dawabag-web frontend-web
# behind a proxy with its own CA:  --secret id=ca,src=/path/ca.crt  (and --network host if the proxy is on localhost)
# Docker Hub rate limits: take the same official image from ECR Public
#   --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine
```

Local run of the whole stack: `docker compose up -d --build` (see `docker-compose.yml`).

## 4. Database migrations

`database/NN_*.sql` are applied in order, once each, by `backend/src/db/migrate.ts`
(recorded in `schema_migrations` with a checksum; an edited applied file is reported,
never re-run). On staging / trial the compose service `migrate` runs it as the database
owner before the API starts (the API runs with `RUN_MIGRATIONS=false`); with
`DB_APP_LOGIN` / `DB_APP_PASSWORD` set it then creates or corrects the API's own login
(section 6, "Database roles"). Without compose the API image still runs it before
starting unless `RUN_MIGRATIONS=false`. By hand: `npm run build && npm run db:migrate`
(`-- --status` to list).

- **New database:** nothing to do — all migrations run.
- **A database created before the runner existed** (first-boot SQL, up to 08):
  `npm run db:migrate -- --baseline 08` once, then `npm run db:migrate`.
- Never edit a migration that has run anywhere; add the next number.

## 5. Health

- `GET /health` — process is up (use for container liveness).
- `GET /ready` — database and Redis answer; 503 otherwise (use for the load balancer).
- Stop with SIGTERM: in-flight requests finish, then connections close (15 s limit).

## 6. Logs, backups and retention

- Logs: JSON lines on stdout in production → CloudWatch Logs. Set retention to at
  least **180 days** (CERT-In, C-43).
- Every request has an id (`X-Request-Id`, kept from the load balancer when it sends
  one). It is on the access-log line (`rid=…`), on any error log line and in every error
  reply (`request_id`), so a reference a user quotes from an error screen finds the
  request in CloudWatch.
- Database: RDS automated backups with point-in-time recovery; keep monthly snapshots
  for **8 years** (GST books 72 months, C-34). Test a restore every quarter. (Staging: nightly backups to the object store and
  `restore.sh`, section 7c.)
- Statutory records are final in the database: the H1 register, credit notes, audit
  and consent logs, the prescription dispense ledger, verified prescriptions cannot be
  updated or deleted; invoice amounts cannot change.
- **Health data key (Sprint 43, migration 38).** A buyer's allergies, conditions and current
  medicines (`health_profiles.sealed`) and a family member's allergies and conditions
  (`patients.health_sealed`) are kept only encrypted by the API (AES-256-GCM, the row's table
  and id bound in; `services/healthProfile/sealing.ts`); the plain JSONB columns stay `[]` and a
  check constraint refuses plain values next to a sealed one. Nothing searches these fields.
  **Key:** `HEALTH_ENC_KEY` (≥ 32 random characters, `openssl rand -hex 32`) in the secret store,
  **required with `APP_ENV=production`**; staging without it derives one from
  `JWT_REFRESH_SECRET` (dashboard warning `HEALTH_KEY_NOT_SET`); development / CI use a fixed
  development key; the trial derives a stable one from `DB_PASSWORD` in `deploy/trial/trial.sh`
  (no change to an existing `TRIAL_ENV`). At every start-up the API seals rows still in plain
  columns (rows written before Sprint 43) and re-seals values sealed with an older key; it logs
  "Health details sealed at rest: n profile(s), m family member(s)" and writes the audit action
  `health_data_sealed`. A value the server cannot open answers 500 `HEALTH_DATA_UNREADABLE`
  (plain message, no details) and the start-up log says how many rows it could not open.
  **Rotating the key:** (1) put the current key in `HEALTH_ENC_KEY_PREVIOUS` (comma-separated
  if more than one) and the new one in `HEALTH_ENC_KEY`; (2) restart the API and wait for the
  "sealed at rest" log line (every row re-sealed under the new key); (3) check
  `SELECT COUNT(*) FROM health_profiles WHERE sealed NOT LIKE 'h1.<new key id>.%'` is 0 (the key
  id is the 8 characters after `h1.` on a freshly saved row) and the same for
  `patients.health_sealed`; (4) remove `HEALTH_ENC_KEY_PREVIOUS` and restart. On the trial, to
  move from the derived key to your own: set `HEALTH_ENC_KEY_PREVIOUS` to the derived value
  (`printf 'dawabag-health-key:%s' "$DB_PASSWORD" | sha256sum | cut -c1-64`) for one deploy.
  Losing the key loses the health details (buyers re-enter them); backups hold only sealed values.
- **Order changes before packing (Sprint 43, migration 38).** A buyer may lower quantities or
  remove lines while none of the order's parcels is packed (`POST /orders/:id/edit`). The
  invoice stays as issued; each seller gets a credit note (reason `order_edit`);
  `order_items.removed_qty` grows (trigger: never back down) and what is packed, dispatched,
  entered in the H1 register and returnable is `supply_qty`. The change is kept in
  `order_edits` (final except its refund status) and the audit log (`order_edited`). Money:
  refunds with source `order_edit` through the refund ledger — at once for a captured / wallet /
  credit-bill order; for a prescription order whose payment is only authorised, right after the
  capture (Razorpay captures the authorised amount in full; `order_edits.refund_status`
  `after_capture` → `recorded`), or `not_needed` if the hold is released. Accounts see these in
  Admin → Refunds like any other refund.
- **Sale record per shipment (Sprint 42, migration 37).** At order placement each shipment
  keeps its sale identity: the seller's licences that day and the ones its lines were sold
  under (`sale_licences`; per line `order_items.sale_licence_form` / `_number`, `price_field`),
  the channel (`retail` Form 20/21 or `wholesale` Form 20B/21B), the buyer's type and a trade
  buyer's licences. The trigger `order_shipments_identity_final` refuses any change once
  frozen; the pharmacist of record (name, number, who, when, and `pharmacist_registration` —
  council, valid till, status as at the check) is written by the release or refusal and is
  then final (a hold may be overwritten by the decision). Invoices, the H1 register and the
  sales register read this record, not today's licence register — renewing a licence changes
  only later sales. Shipments from before migration 37 were filled from the data held then and
  carry `sale_identity_source = 'backfill'`. A genuine correction needs the maintenance role
  (operator SQL with an audit entry), never the API.
- **Maintenance bypass (Sprint 38, migration 33).** `SET LOCAL dawabag.maintenance = 'on'`
  alone no longer does anything. It counts only while the session acts as the NOLOGIN
  role `dawabag_maintenance` — either inside a controlled function owned by that role
  (today: `dawabag_purge_prescriptions`, used by the retention job) or after
  `SET LOCAL ROLE dawabag_maintenance`, which only a superuser or a login explicitly
  granted the role can run. The API's login is never granted it. A data repair: written
  approval first, then, as the database owner,
  `BEGIN; SET LOCAL ROLE dawabag_maintenance; SET LOCAL dawabag.maintenance = 'on'; …; COMMIT;`
  and an entry in the incident register. Repairs to the H1 register or the audit log
  break their hash chains — the integrity check will report it (that is the point).
- **Database roles (Sprint 38; the API's own login since Sprint 41).** Migration 33 creates
  `dawabag_app` (NOLOGIN; SELECT / INSERT / UPDATE / DELETE on every table, sequences, and
  EXECUTE on the purge function) and `dawabag_maintenance`. **Migrations run as the owner**
  (`POSTGRES_USER` = `dawabag_user`, with `DB_PASSWORD`) in the one-shot compose service
  `migrate`; the same run creates or corrects **the API's login** `DB_APP_LOGIN` (default
  `dawabag_api`) with `DB_APP_PASSWORD`: LOGIN, not a superuser, cannot create roles or
  databases, member of `dawabag_app` only (any other membership is revoked), the password sent
  as a SCRAM verifier (`backend/src/db/appLogin.ts`). It also re-grants `dawabag_app`'s
  privileges and gives the purge function back to `dawabag_maintenance` — so it repairs a
  database restored without privileges. **The API connects only as that login** (compose
  replaces `DB_PASSWORD` for the API, so the API container never holds the owner's password).
  The API, its scheduler and its Bull queues (one process) all use it; it cannot
  `ALTER TABLE … DISABLE TRIGGER`, `TRUNCATE` a register, `SET ROLE dawabag_maintenance` or
  create objects. The API logs `PostgreSQL connected as dawabag_api (restricted API login)`;
  otherwise it warns, Admin → dashboard shows `DB_LOGIN_NOT_RESTRICTED`, and with
  `APP_ENV=production` it refuses to start. Check on a server: `deploy/trial/trial.sh dblogin`.
  - **Demo seed / removal** run as the owner in the `migrate` container
    (`trial.sh seed` / `unseed`: `docker compose … run --rm --no-deps -e DEMO_SEED=true migrate
    node dist/scripts/demoSeed.js [--remove]`) — removal needs the maintenance role.
  - **Retention purge** (job `retention_purge`) runs in the API as the restricted login; it
    deletes prescriptions only through `dawabag_purge_prescriptions` (SECURITY DEFINER, owned
    by `dawabag_maintenance`).
  - **Passwords:** `DB_PASSWORD` (owner) and `DB_APP_PASSWORD` (API) — at least 16 printable
    characters, different. On the trial, a `TRIAL_ENV` without `DB_APP_PASSWORD` still deploys:
    `trial.sh` derives it from `DB_PASSWORD` (one-way SHA-256, never stored or printed). To
    choose one: add `DB_APP_PASSWORD=<openssl rand -hex 24>` to the settings (TRIAL_ENV secret
    or `staging.env`) and deploy; the `migrate` service sets the new password before the API
    starts. Production (RDS): the same split — the RDS master user runs `db:migrate` with
    `DB_APP_LOGIN` / `DB_APP_PASSWORD`, the API task gets `DB_USER=dawabag_api` and that
    password only.
- **Hash chains (C-09, C-46).** The H1 register (one chain per seller licence, numbered
  1, 2, 3 …) and the audit log (one chain) are sealed when each transaction commits.
  Admin → Record integrity (or `GET /fulfilment/h1-register/verify`,
  `GET /admin/audit-chain/verify`) recomputes every hash and names the first broken
  entry. **Sprint 40:** the nightly job `chain_verify` (02:20 IST) does the same for every
  chain and records each chain's head (last number + hash) in the append-only table
  `chain_heads`; the next run checks that the old head is still there unchanged, so
  removing the newest entries is caught too. Admin → Record integrity shows the latest
  heads and can run the check now (one check at a time). **Sprint 41:** every backup
  records the heads too — the audit head and each H1 register's last entry and hash, read
  just before `pg_dump` — in the dump's object metadata and as `<key>.heads.json` beside it
  (a copy outside the database; `restore.sh` checks them, "Restore drill" below).
- **Chain break (alert `chain_break`).** Every admin is told at once. Do not "fix" rows:
  keep the database as it is, take a snapshot, open an incident (Admin → Security
  incidents, C-43), compare with the last backup and the recorded heads to find what was
  changed or removed, and restore from backup if needed. The setting
  `integrity.chain_start` (e.g. `{"audit": 2823}`) makes the check start part-way along a
  chain; use it only after a documented restore that legitimately restarted a chain (and
  in test databases whose clean-ups delete rows) — it is a super-admin settings change,
  audited, and shown on the integrity page.
- **Restore drill (Sprint 41; with the quarterly restore test, section 7c).**
  1. `deploy/staging/restore.sh latest` (or a monthly key) on the server. Besides the row
     counts and the last migration it now prints `chain heads  N recorded with the backup, all
     present and unchanged`: the heads recorded with that backup (`s3.mjs heads <key>`,
     checked against the SHA-256 stored in the dump's metadata) must all be in the restored
     database with the same hash. `RESTORE FAILED: chain head …` or "do not match the
     backup's checksum" is an incident (C-43): keep both, do not restore that copy.
     A backup from before Sprint 41 has no heads (a warning); compare by hand with Admin →
     Record integrity.
  2. Live restore only after written approval and an incident entry: stop the API
     (`docker compose … stop api`), `restore.sh <key> --into-live`, then `trial.sh up` (or
     `docker compose … up -d`): the `migrate` service runs first and restores the API
     login, `dawabag_app`'s privileges and the purge function's owner (the dump is restored
     without owners / privileges), then the API starts. `trial.sh dblogin` shows the login.
  3. Admin → Record integrity → run the check. On a restored database the chains are
     intact up to the backup's heads, but the `chain_heads` rows recorded **after** the
     backup (by the nightly job on the old database) are not in it; `chain_heads` from before
     the backup are, and they match. If entries were made after the backup and are lost, the
     check is still clean (they are simply not there) — record in the incident which numbers
     were lost (from the old database or the last recorded heads), and the new entries
     continue from the restored head.
  4. `integrity.chain_start` — only when a chain legitimately restarts (e.g. a register
     re-created from paper records after a disaster, or a test database whose clean-ups
     delete rows). It is not editable through the API (deliberately: no super-admin can move a
     chain's start past a break); the operator sets it as the owner, with written approval,
     and writes an audit entry in the same transaction:
     `BEGIN; INSERT INTO app_settings (key, value, description) VALUES ('integrity.chain_start', '{"audit": 2823}', 'Set after restore of <key>, incident <no>') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(); INSERT INTO audit_logs (action, new_value, notes) VALUES ('integrity_chain_start_set', '{"audit": 2823}', 'restore of <key>; incident <no>; approved by <name>'); COMMIT;`
     The value shows on Admin → Record integrity and is recorded with every later backup.
  5. Log the drill (date, backup key, counts, heads found, time taken) in the ops log.
- **Prescription retention (Sprint 38).** Each prescription has `retain_until` = its last
  dispense + `retention.prescription_years` (owner confirmed 3). Purging is OFF until
  the owner switches `retention.prescription_purge` on; then the retention job deletes
  prescriptions past `retain_until` that are not on the H1 register, and their files.

## 7. Scheduled jobs

Run inside the API (IST): licence expiry, GSTIN re-check, low stock, credit
reminders, partner settlements, refills, licence register alerts, payment and
e-invoice sweeps, recall-alert watch, retention purge. A Redis lock makes each run
happen once even with several API instances. Admin → Jobs shows runs and can trigger
one. When a job fails after working, admins get one alert (email and push); they are not
told again until it has succeeded once.

Sprint 39 jobs: **payment_hold_watch** (every 15 min) and **pharmacist_registration_alerts**
(daily 01:50) — see section 7f.

Sprint 40 jobs: **chain_verify** (daily 02:20; section 6) and **self_inspection_watch**
(daily 08:10; section 7g).

## 7g. GDP, recall drills and self-inspections (Sprint 40)

**GDP records per batch (C-25).** Staff → *GDP records* lists Dawabag's and partners'
batches with their standing; each batch has an append-only log (received — written by the
goods receipt with the storage condition — storage checks, temperature readings,
excursions, pharmacist decisions, transfers, dispatch). Store staff record on Dawabag's
batches; partners record on theirs (Partner portal → *GDP records*).
- A cold-chain reading outside 2–8 °C is stored as an **excursion** and puts the batch
  **on hold**: it is not offered, allocated, packed or dispatched (Dawabag's and partners'
  stock alike; reserved lines wait at pack / dispatch with `GDP_HOLD`). Pharmacists and
  admins (or the partner's owner and Dawabag's admins) are alerted (`gdp_excursion`).
- A cold-chain **pack read outside 2–8 °C at dispatch** is still refused (409
  `COLD_CHAIN_EXCURSION`), and is logged as an excursion on the shipment's batches first.
- Staff → *GDP excursions*: a Dawabag pharmacist with a valid registration decides on
  Dawabag's batches — **release** (justification, e.g. the data logger and the maker's
  stability data), **quarantine** (still held, decide later) or **destroy** (held for good;
  the free stock is raised as a write-off, reason *damaged*, for a second person to approve,
  then the destruction register is completed). A partner's batch is decided by the
  partner's own registered pharmacist (it is the licensee); a partner's destroyed batch is
  destroyed under the partner's licence and never supplied through Dawabag again.
- Nobody can lift a hold by editing the batch: the standing changes only through a GDP
  record (database trigger), and GDP records cannot be changed or deleted.

**Mock recall drill (O15, C-28).** Admin → *Recall drills*: choose a batch (Dawabag's or a
partner's) and a scenario; the server runs the real recall trace (orders, shipments,
buyers, partners, H1 entries, stock on hand by location, where the batch came from) and
records the start, the time to trace and the findings — **nobody is contacted and nothing
is blocked**. The report is printable and downloadable as a PDF built on demand from the
record (never stored). Close each drill with a conclusion; the traced record cannot be
changed. Suggested: one drill a quarter, alternating Dawabag and partner batches.

**Self-inspection register (O15, C-34).** Staff → *Self-inspections*. Admins keep the
checklists (*Checklists*; a monthly one is provided: storage temperatures, expiry
segregation, licence display, pharmacist presence, H1 register, cold-chain equipment, pest
control, records). A pharmacist or admin records an inspection: every item ok /
observation / non-conformity (with a note); a non-conformity needs a corrective action with
an owner and a due date. Results are append-only; an action moves open → in progress →
closed (close-out note), each step kept. The daily job alerts admins and the owner once
when an action passes its due date, and admins once when a checklist is overdue.

**Product class and new drugs (D6, C-10).** Each product has a class (drug, device,
cosmetic, ayush, general; existing products became *drug*, or *ayush* / *cosmetic* /
*general* where the category clearly said so) and a *new drug* flag (NDCT Rules 2019). A
**medical device can never be allowed for online sale** until a device track exists; a
**new drug** is allowed only by a pharmacist with a confirmation note (kept on the product
and in the status log). Reclassifying a product on sale as a device, or flagging it as a
new drug, switches it off at once. Set them in the product form, the new-product form or
the catalogue file (optional columns *Product class*, *New drug*).

**Partner batch suppliers.** Partner portal → *Batch suppliers* lists the partner's batches
with their supplier details (from the stock file, the live feed or the portal); missing
ones can be added once and are read-only afterwards. The stock-file template
`templates/03_Partner_Inventory_Submission.xlsx` (sheet 4) carries the optional columns
`supplier_name`, `supplier_licence_no`, `supplier_invoice_no`, `supplier_invoice_date`.

## 7f. Prescription orders: authorise-then-capture (Sprint 39)

Owner decision 2026-10-03 (C-08, C-37): an order with prescription medicines is paid by
**authorisation only**; the money is captured when the pharmacist's check passes (the
prescription is verified and every shipment holding a prescription line is released — a
partner's part by the partner's own pharmacist). A refused, cancelled or timed-out order is
**never charged**: the authorisation is simply not captured.

- **Razorpay dashboard.** Nothing to switch for normal orders: each prescription order is
  created with `payment.capture = "manual"` and `capture_options.manual_expiry_period`
  (default 7200 minutes = 5 days, Razorpay's maximum); OTC orders keep `payment_capture`
  (automatic). The per-order options override the dashboard's capture setting — check this
  once in **test mode** (Account & Settings → Payment capture): place an Rx order, pay with a
  test card, and confirm the payment shows **Authorized** until the pharmacist verifies it,
  then **Captured**. Subscribe the webhook to `payment.authorized`, `payment.captured`,
  `payment.failed`, `refund.processed`, `refund.failed` (deduplicated by the signed body).
- **No void call.** Razorpay cannot refund or void an authorised payment; an uncaptured one
  is returned to the buyer automatically when its capture window ends (the bank may show the
  hold a few more days). Dawabag marks it `released` (payments.status) at once and tells the
  buyer they were not charged.
- **Expiry safety.** Setting `payments.rx_authorisation` (Admin → Settings → *Prescription
  orders: payment hold*): staff (admins and pharmacists) are alerted after
  `alert_after_hours` (48); after `release_after_hours` (72) an order still unchecked is
  cancelled and its hold released — always at least 2 hours before the gateway window
  (`gateway_expiry_minutes`, 7200). The job retries captures that failed for a network
  reason; if the gateway says the hold has already ended, the order is cancelled and the
  buyer told they were not charged.
- **Packing waits for the money.** Pack and dispatch (Dawabag and partner) refuse with
  `PAYMENT_NOT_CAPTURED` while a payment is only authorised.
- **Mixed carts** (OTC + prescription lines) are one authorisation, captured in full after the
  check (Razorpay captures the authorised amount; no partial capture).
- **Demo payments** (trial) simulate the same steps: authorise at checkout, capture on the
  pharmacist's check, release on refusal / cancellation / timeout — no gateway, flagged demo.
- **If Razorpay captured automatically anyway** (dashboard set to auto-capture and the order
  option ignored), the payment is recorded as captured at checkout as before Sprint 39, and a
  refusal is refunded (C-37). Fix the dashboard setting.

Pharmacist registrations (Sprint 39, C-03): Admin → *Pharmacist registrations* records each
Dawabag and partner pharmacist's council, number, valid-till and status and marks it
verified. Unverified / lapsed / expired / suspended registrations block prescription
verification, the order check, partner releases and medicine-information approval.
Pharmacists working before Sprint 39 were carried over as "not yet recorded" (allowed,
with a warning) — complete their records before go-live.

## 7h. Invoice at approval, order changes, sales to doctors (Sprint 44)

Owner decision 2026-10-03: an order can be changed only **before the pharmacist's approval**,
and the **tax invoice is issued at that approval** (DECISIONS.md, Sprint 44 rows).

- **Invoice numbers.** A shipment takes its seller's gap-free number (Dawabag `DWB/…`, a
  partner its own prefix) when a registered pharmacist releases it — the database does it in
  the release itself (trigger `order_shipments_issue_invoice`, migration 39). Orders placed but
  not yet approved show "The tax invoice is issued when our pharmacist approves the order." A
  cancellation or change before approval takes no number and needs no credit note. GST
  registers, GSTR-1 and e-invoicing read the issue date (`invoice_issued_at`). Invoices issued
  before Sprint 44 keep their numbers and dates. A partner without an invoice prefix cannot be
  released ("The partner's invoice series is not set up") — set it at approval.
- **Second payments.** A change that raises the value waits for the buyer's payment of the
  difference (order page "Pay the difference"; Razorpay order with `notes.order_edit_id`); the
  pharmacist's release and prescription verification answer 409 `EXTRA_PAYMENT_PENDING` until
  it is paid (or authorised, for an order with prescription medicines). An unpaid difference
  does **not** time out (owner decision CONFIRMED 2026-10-04); staff may cancel the order. A
  held order payment still ends after the hold time (section 7f), which cancels the order.
  Razorpay webhooks need no change. One change is paid by one payment: a second payment for
  the same change (two tabs, a retry) is released or refunded at once (Sprint 48).
- **Approvals and changes never cross (Sprint 48).** Every approval — the pharmacist check
  (Dawabag and partners) and the prescription review — locks the order before its parcels, as
  a change does. The check screens send back how many changes they showed: if the buyer
  changed the order since, the approval answers 409 `ORDER_CHANGED` — reopen and check again.
  At approval (the moment of sale) the buyer's standing is checked again: a doctor whose
  registration lapsed or was suspended, or a buyer no longer allowed a restricted product
  (section 7k), answers 409 `BUYER_NOT_ELIGIBLE` — hold the order or refuse it (refunded).
- **Doctor / institution buyers** (FDA Maharashtra circular Drug/Wholesalers Memo./16/2026/1,
  r.64(2), r.65(9)(b)): Admin → *Doctor registrations* lists accounts needing attention —
  check the council's register and the uploaded certificate, then **Verify** with the
  valid-till date (or Not verified / Suspend with a reason). Doctors verified before Sprint 44
  must be re-verified with valid-till and the certificate before their next order. Every order
  needs a signed written order (uploaded, or signed in the app with the doctor's password);
  the pharmacist sees it in the check. *Sales to doctors* (Admin and Partner portals) is the
  register for the drugs inspector — period, CSV, links to the certificate and written order
  (5-minute, every view logged). Uploads need the object store (`AWS_S3_BUCKET`).

## 7i. Imported medicine-information drafts (Sprint 45)

- Staff → *Import medicine information drafts* (`/staff/medicine-info-imports`, admins and
  pharmacists). Choose the partner (e.g. Nootan), then upload the drafts workbook: an .xlsx
  (≤ 10 MB, ≤ 5,000 rows) with a sheet named `drafts` whose first row is exactly
  `item_name, pack, company, assumed_composition, composition_confidence, drafting_note,
  content_json` (any order). *Download template* gives the empty workbook. The file is read
  in memory and not kept.
- `item_name`, `pack`, `company` must be written exactly as the partner's billing export
  prints them: the row is matched through that partner's item links (the same key the stock
  import uses). Items the partner has not linked yet — apply its stock file or link the item
  under Partner stock files / Requests first — come back as "Not in catalogue yet" with a
  CSV; import the same file again later and only the newly linked products are filled.
- Nothing reaches buyers: every row becomes a DRAFT. Pharmacists work through
  *Imported drafts to check* (`/staff/medicine-info-imported`, by partner): open, check every
  line against the pack insert (yellow banner shows the assumed composition and the
  drafter's note), edit, send. Only a pharmacist with a valid registration can send an
  imported draft; a second pharmacist approves it on *Medicine information to approve*.
- Approved information and information waiting for review are never changed by an import.
  Tick "replace unapproved drafts only" to overwrite open drafts with the file's words.
- Audit: `product_info_drafts_imported` (who, partner, file name + SHA-256, counts; no text).

## 7j. Catalogue suggestions for draft products (Sprint 46)

- Order of work for a partner's new products (e.g. Nootan): (1) the partner's stock file is
  uploaded and its unknown items become requests; (2) an admin uses *Create drafts* on those
  requests (Admin → Partner stock files → Requests); (3) suggestions for the drafts are
  imported here; (4) a pharmacist completes and approves each product on *New products to
  complete*.
- Staff → *Import catalogue suggestions* (`/staff/catalogue-suggestions`, admins and
  pharmacists). Choose the partner, upload an .xlsx (≤ 10 MB, ≤ 5,000 rows) with a sheet
  named `suggestions` whose first row is exactly `item_name, pack, company, generic_name,
  strength, dosage_form, drug_schedule, cold_chain, product_class, is_new_drug, category,
  hsn_code, gst_rate, confidence, note` (any order). *Download template* gives the empty
  workbook with a `how_to` sheet; *Accepted values* on the page lists what each column takes
  (from `GET /api/v1/catalogue-suggestions/format`). The file is read in memory and not kept.
- Accepted values: drug_schedule `OTC, Non-scheduled, Schedule G, Schedule H, Schedule H1,
  Schedule X, NDPS` (also H, H1, G, X); Schedule C / C1 is a separate yes/no the pharmacist
  ticks (a "C/C1" schedule cell is refused with that explanation). dosage_form `Tablet,
  Capsule, Syrup, Suspension, Drops, Injection, Ointment, Cream, Gel, Lotion, Solution,
  Powder, Sachet, Inhaler, Spray, Soap, Device, Other`; product_class `drug, device, cosmetic,
  ayush, general`; gst_rate `0, 5, 12, 18, 28`; cold_chain / is_new_drug `yes` / `no`;
  hsn_code 4, 6 or 8 digits; confidence `high, medium, low` (required). A blank cell = no
  suggestion for that field. A category or HSN code not in the lists is kept and flagged
  ("create with Alt+C if right"); a bad schedule / class / form / GST / yes-no value makes
  the row invalid.
- Matching is the partner's own item links (as the stock import and Sprint 45). Only an item
  linked to a DRAFT product takes a suggestion. A live product is reported "Already in
  catalogue" and never changed. Unmatched rows are "No draft yet" (CSV); when the partner has
  open requests for some of them, an admin sees *Create drafts for the N matched requests,
  then import again* on the result.
- A suggestion is never written into the product. The pharmacist's form shows it as
  "Suggested — check against the pack" with the confidence and note, pre-fills empty fields,
  and saves a value only when the pharmacist presses *Use* (per field or *Use the suggested
  values I have checked*) or types their own; cold chain is always chosen explicitly (C-25).
  *New products to complete → With suggestions (high confidence first)* (or
  `/staff/new-products?suggested=1`) goes through them; each product is still approved
  one at a time by a pharmacist (no bulk approve, C-10 / C-19).
- Re-importing adds a new suggestion only while the draft is open and only if something
  changed; earlier suggestions are kept (table `catalogue_draft_suggestions`, immutable).
- Audit: `catalogue_suggestions_imported` (who, partner, file name + SHA-256, counts, draft ids).

## 7k. Who may buy a product (Sprint 47)

- Each product has **Who may buy**: *Everyone* (default — every existing and new product),
  *Doctors and hospitals only* (`practitioners_only`: doctor / institution accounts whose
  medical council registration Dawabag verified and is in date, Sprint 44; the signed written
  order is still needed on every order, Drugs Rules r.65(9)(b)), or *Licensed trade buyers
  only* (`trade_only`: approved retailer / wholesaler accounts whose checked drug licences are
  all in date, Sprint 30 / 32 — and verified doctors / hospitals). **Which products are
  restricted is the owner's decision** (DECISIONS 2026-10-04); nothing is restricted until a
  pharmacist sets it.
- Set it: *Staff → Online-sale status* → column *Who may buy* → *Change* (pharmacists with a
  valid registration only; a reason of at least 10 characters), or in *New products to
  complete* when approving (*Who may buy*; a suggestion from the catalogue suggestions file is
  shown as "Suggested — check" with *Use*, never chosen for you). Admins see the badge, the
  history and Admin → Products, but cannot change it. API: `PUT /buyer-restriction/products/:id
  {restriction, reason}` (pharmacist_rx), `GET /buyer-restriction/products` and
  `…/:id/log` (pharmacists, admins).
- What buyers see: the product stays in search and on its page for everyone, with the label
  "Supplied only to doctors and hospitals" / "Supplied only to licensed trade buyers"; buyers
  who may not buy it get no *Add to cart*. The server refuses it on every path with **403
  `BUYER_RESTRICTED`** and a plain message: cart add / raise (lowering or removing a line is
  allowed), checkout preview and order placement (Dawabag's stock and partners' alike), lines
  added before the invoice (Sprint 44 order changes), new refills (left out) and due refill
  orders (refill fails with the reason, buyer told). "Buy again" and "Cheaper option" only
  offer products the buyer may buy. The emergency stop (Sprint 38) is independent.
- Records: every change is in `product_buyer_restriction_log` (who, when, old → new, reason;
  append-only, the database refuses edits and a change without who / why) and audited
  (`product_buyer_restriction_set`). Migration 42.
- Catalogue suggestions file (§7j): an optional 16th column `buyer_restriction`
  (`everyone` / `practitioners_only` / `trade_only`); files with the 15 columns import as before.

## 7l. Launch readiness page (Sprint 49)

- **Admin → Launch readiness** (`/admin/launch-readiness`, admins and super-admins; dashboard
  card "Launch readiness: X of Y ready") is the live version of `docs/LAUNCH_CHECKLIST.md`.
  Each item shows its status (*Done*, *In progress*, *Not started*, *Not applicable on trial* /
  *Not needed*), the evidence, who does it and a link to the screen where it is done. "Y"
  leaves out items not applicable on this server.
- **Computed** from the database and the API's environment on every load (nothing kept):
  Razorpay keys and test / live mode (from the key id's prefix), webhook events in the last
  30 days, MSG91 key + DLT templates for otp / dispatched / out for delivery / delivered /
  order cancelled / return update, nightly backups (`job_runs` `db_backup`, §6) and the
  record-integrity check (latest `chain_heads`), `APP_ENV` and demo data, `HEALTH_ENC_KEY` /
  `TOTP_ENC_KEY`, the restricted database login, `PUBLIC_WEB_URL`, Shiprocket / Firebase /
  Agora, the emergency stop, catalogue (live products, drafts waiting, drafts with
  suggestions, product text approved), online-sale status, medicine information (approved /
  without, imported drafts open), cold-chain couriers, pharmacist registrations (Dawabag's and
  partners', verified and in date), two-step sign-in policy and enrolment share, doctor
  registrations, the five policies (published, lawyer-reviewed). Secrets are reported only as
  *set* / *not set* — never a value (C-41, C-44). Live keys, `APP_ENV=production` and backups
  are *not applicable* on the trial.
- **Manual** items (lawyer, CA, DLT registration, restore drill, release signing key, stock
  feed solution, Schedule C / C1 completeness, rider logins, test orders, external
  penetration test …) live in `launch_checklist_items` (migration 44, seeded from the
  checklist on 4 Oct 2026). An admin presses *Update* to set status and note; each change is
  audited (`launch_checklist_item_updated`, old → new) and the database refuses deleting an
  item or changing anything but status and note. Some manual items show counts the software
  can see (products marked Schedule C / C1, products with a buyer restriction, live stock
  feeds, rider logins).
- API: `GET /api/v1/admin/launch-readiness`, `PUT /api/v1/admin/launch-readiness/manual/:key
  {status, note?}` (admin, super_admin; 422 for an unknown status or a note over 1000
  characters, 404 for an unknown item).

## 7a. Development and CI

- One command brings a fresh machine to a running, migrated API against the fake
  providers: `. scripts/dev-env.sh && scripts/dev-up.sh`, then
  `cd backend && npm run test:smoke` in the same shell. Redis runs without snapshots;
  the values in `dev-env.sh` are throwaway and must never be used in production.
- GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request:
  backend type check and unit tests, migrations on an empty PostgreSQL 16 (twice, to
  prove they re-run), every end-to-end suite against the fakes, and the web type check,
  lint and build. Merge only when CI is green.

- Dependencies: CI fails on any high or critical `npm audit` advisory (backend and web,
  runtime packages). When it fails, upgrade the package; do not silence the check. The
  web app runs Next.js 15.5 with React 19 (Next 14 no longer receives security fixes);
  email goes straight to the SES API (no SMTP library).
- CI also drives the website in a real browser (e2e/, Playwright: search, product page,
  sign-in cookie, server-held cart, admin access, no browser storage, WCAG 2.1 AA via
  axe on the public pages), analyses and unit-tests the Flutter app, and builds both Docker images: the
  API image must migrate an empty database and answer `/ready`, the web image must
  serve the home page.
- Indexes: migration 18 adds indexes for the busy lookups (shipment lines, recall
  matching, purchasing, returns, consultations, retention). On a large live table, add
  future indexes with `CREATE INDEX CONCURRENTLY` in a maintenance window instead of a
  normal migration.

## 7b. Mobile app builds

- Every push builds a debug APK (GitHub → Actions → CI → the run → Artifacts →
  `dawabag-debug-apk`, kept 14 days). Set the repository variable `MOBILE_API_URL`
  (Settings → Secrets and variables → Actions → Variables) to the API address testers
  should use; without it the APK points at an Android emulator's own machine.
- Push notifications need the Firebase values as build settings (`FIREBASE_API_KEY`,
  `FIREBASE_APP_ID`, `FIREBASE_SENDER_ID`, `FIREBASE_PROJECT_ID`, see mobile/README.md);
  without them the app runs with push off. Firebase settings are not secrets but are
  kept with the release configuration, not in the code.
- Before the Play Store: confirm the final application id (now `com.dawabag.app` —
  Android forbids `in` as a package segment; it cannot change after the first upload).
  iOS needs an Apple developer account, a Mac and Xcode for signing.
- Release signing. Release builds are signed only with the Play **upload key**; without
  it `flutter build appbundle --release` (or `apk --release`) stops with a message
  naming what is missing — it is never signed with the debug key. Debug builds need no
  key. Create the key once, on a trusted machine, and keep it in the company password
  manager (never in the repository — `key.properties`, `*.jks` and `*.keystore` are
  ignored):

  ```
  keytool -genkeypair -v -keystore dawabag-upload.jks -storetype PKCS12 \
    -keyalg RSA -keysize 4096 -validity 10000 -alias upload \
    -dname "CN=Dawabag, O=<legal entity>, L=<city>, C=IN"
  base64 -w0 dawabag-upload.jks > dawabag-upload.jks.b64   # for the GitHub secret; delete after pasting
  ```

  (PKCS12 uses one password for the store and the key: use it for both settings.)
  GitHub → Settings → Secrets and variables → Actions: **secrets**
  `ANDROID_KEYSTORE_BASE64` (the .b64 file's content), `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS` (`upload`), `ANDROID_KEY_PASSWORD`; **variable** `MOBILE_API_URL`
  must be the `https://` API address (a release build refuses plain http). CI then also
  builds a signed bundle on every push — Actions → the run → Artifacts →
  `dawabag-release-aab` (30 days; version code = the CI run number) — decoding the key
  into the runner's temp directory and deleting it after the build. Without the secrets,
  or with a non-https `MOBILE_API_URL`, those steps are skipped with a notice and CI stays
  green. To build on a release machine instead, set `ANDROID_KEYSTORE_PATH`,
  `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` in the
  environment, or put `storeFile`, `storePassword`, `keyAlias`, `keyPassword` in
  `mobile/android/key.properties` (paths relative to `mobile/android/`).
- Play Console: enable **Play App Signing** when creating the app and upload the first
  bundle signed with this upload key; Google keeps the app signing key. A lost or leaked
  upload key can then be replaced through Play support (Setup → App signing) without
  losing the app — keep the key's password and owner on record, and rotate the GitHub
  secrets when anyone with access leaves.
- The app keeps nothing on the device except the sign-in token in the OS keychain;
  Android backups are switched off so no copy of app data leaves the phone.

## 7c. Staging server (single machine)

For beta testers and the mobile app's test builds, one Linux server (2 vCPU, 4 GB, in
ap-south-1) runs the whole stack from `deploy/staging/`:

1. Install Docker; point DNS for the website and API names (e.g. `staging.dawabag.in`,
   `api-staging.dawabag.in`) at the server; open only ports 80 and 443.
2. `cp deploy/staging/staging.env.example deploy/staging/staging.env` and fill it in
   (long random `DB_PASSWORD`, a different `DB_APP_PASSWORD` for the API's own database
   login, JWT secrets; test-mode Razorpay/MSG91 keys). The file stays on the server only
   (git ignores it).
3. `docker compose -f deploy/staging/compose.yml --env-file deploy/staging/staging.env up -d --build`
   — Caddy obtains HTTPS certificates by itself; the `migrate` service applies the
   migrations as the owner and makes the API's login, then the API starts (section 6).
4. `WEB_DOMAIN=… API_DOMAIN=… deploy/staging/check.sh` — HTTPS, redirects, HSTS, CORS,
   request ids, closed database port.
5. Set the GitHub variable `MOBILE_API_URL=https://api-staging.dawabag.in` so test APKs
   reach it (the app adds `/api/v1` itself).

The owner's one-click trial of this same stack is section 7e / `deploy/trial/TRIAL.md`.

Update: `git pull` and the same `up -d --build`. Staging holds test data only — never
real patients. CI starts this exact stack on every push and runs the same checks.

**Backups (automatic).** The database lives in the `postgres_data` volume on that server;
the `backup` service copies it to the object store every night. No dump is ever written
to the server's disk: `pg_dump --format=custom` streams straight into S3 (multipart, with
server-side encryption, C-41), and an object appears only when `pg_dump` succeeded.

- Set up once: create a bucket for backups in ap-south-1 (public access blocked,
  versioning on, default encryption on), an IAM user whose policy allows only
  `s3:PutObject`, `s3:GetObject`, `s3:ListBucket`, `s3:AbortMultipartUpload` (and
  `s3:DeleteObject` only if pruning from the script) on that bucket, and fill the
  `BACKUP_*` lines in `staging.env` (see the example file; without `BACKUP_S3_BUCKET` it
  uses the API's `AWS_S3_BUCKET` and keys). An S3-compatible store works with
  `BACKUP_S3_ENDPOINT`. Then `docker compose … up -d --build backup` and
  `docker compose … logs backup` shows "nightly backups at 02:30 Asia/Kolkata".
- Schedule: `BACKUP_AT`, default 02:30 IST (the containers run in UTC; the schedule is
  computed in Asia/Kolkata, i.e. 21:00 UTC). A backup now:
  `docker compose … exec backup /app/backup/backup.sh run`.
- Keys: `backups/monthly/YYYY/MM/dawabag-YYYYMMDD-HHMM.dump` for the first backup of each
  IST month, `backups/daily/YYYY/MM/…` for every other night (times in IST).
- Retention: daily backups 35 days, monthly backups **8 years** (GST books 72 months,
  C-34; retention schedule C-44). Preferred — the bucket lifecycle rule committed in
  `deploy/staging/backup-lifecycle.json` (it also moves monthly copies to Glacier
  Instant Retrieval after 30 days and clears unfinished uploads):
  `aws s3api put-bucket-lifecycle-configuration --bucket <bucket> --lifecycle-configuration file://deploy/staging/backup-lifecycle.json`.
  If `BACKUP_PREFIX` is changed, change the two prefixes in that file to match. For a
  store without lifecycle rules (or without the Glacier class — drop `Transitions`),
  set `BACKUP_PRUNE=true`: after each good backup the script deletes daily objects older
  than 35 days and monthly ones older than 2922 days.
- Failures: a failed backup logs one line containing `BACKUP FAILED`, exits non-zero,
  is retried once 20 minutes later, and the next night runs as usual. The staging check
  catches a missed night: run on the server, `deploy/staging/check.sh` fails when the
  newest backup is more than 26 hours old (skipped when backups are not configured or
  no backup container runs on that machine; `CHECK_BACKUP=0` skips it). Run it daily
  (e.g. host cron) and after every update.
- Sprint 49: each run is also noted in the database as a `job_runs` row named `db_backup`
  (succeeded with the object key, size and tier, or failed) — Admin → Launch readiness shows
  the newest one (done when under 26 hours old). Noting it is best effort: it never fails the
  backup. The backup itself stays only in the object store.

**Restore.** `deploy/staging/restore.sh latest` (or an S3 key) streams the dump into a new
database `dawabag_restore_check`, prints row counts of users, orders and products and the
last migration applied (next to the live database's), and drops the check database;
`--keep` keeps it for inspection. It never touches the live database unless asked:
`--into-live` restores and checks first, refuses while anything (the API) is connected
to the live database, asks you to type its name, then swaps the restored copy in and
keeps the old one as `dawabag_pre_restore_<time>` — drop that by hand once the API is
verified. Steps: `docker compose … stop api` → `deploy/staging/restore.sh <key> --into-live`
→ `docker compose … up -d` (the `migrate` service restores the API login and privileges
first) → `check.sh`. Since Sprint 41 each backup carries its chain heads and the restore
check verifies them (section 6, "Restore drill").

**Quarterly restore test** (January, April, July, October; record the result in the
ops log): `deploy/staging/restore.sh latest`, and once a year the oldest monthly backup
as well; the counts must be plausible and the last migration must match the live one
(or be the one deployed at that backup's date). A failed restore test is an incident.

## 7e. Owner's live trial (one server, deployed from GitHub)

Owner-facing guide: **[deploy/trial/TRIAL.md](../deploy/trial/TRIAL.md)** — DigitalOcean
Bangalore droplet (4 GB), one bootstrap command, four GitHub secrets, one click.

- `deploy/trial/bootstrap-server.sh` (root, once, idempotent): Docker Engine + compose
  plugin from Docker's apt repository, ufw (22, 80, 443 only), unattended security
  upgrades, 2 GB swap under 6 GB RAM, `dawabag` deploy user (docker group, key only),
  SSH password login off; prints `TRIAL_SSH_HOST`, `TRIAL_SSH_KNOWN_HOSTS`, a new deploy
  key (`TRIAL_SSH_KEY`, printed once, not kept) and with `--email` a `TRIAL_ENV`
  (`deploy/trial/make-trial-env.sh`: sslip.io names from the IP, random secrets).
- `.github/workflows/deploy-trial.yml`: manual (inputs *seed demo*, *reset data*,
  *build apk*), or on push to the trial branch when the variable `TRIAL_AUTODEPLOY` is
  `true`. rsyncs the repository to `~/dawabag`, writes `deploy/staging/staging.env` from
  `TRIAL_ENV`, then `deploy/trial/trial.sh up | ready | seed | backup-once | check` on the
  server, and the staging checks again from outside. One deploy at a time; the key lives
  in the runner's temp directory only. The *android* job builds a debug APK pointed at
  the trial API (artifact `dawabag-trial-apk`).
- The trial is the staging stack with `APP_ENV=trial` and the compose profile
  `objectstore`: MinIO (`alpine/minio`, the last MinIO security release; MinIO stopped
  publishing images in Oct 2025) with data in the `objectstore_data` volume, SSE-S3 with
  `OBJECTSTORE_KMS_KEY`, bucket created by `objectstore-init` (`s3.mjs ensure-bucket`),
  reachable from browsers only through Caddy at `FILES_DOMAIN` for signed GETs. Backups
  go to the same store (`BACKUP_PRUNE=true`).
- Demo data: `node dist/scripts/demoSeed.js` in the one-shot `migrate` container, as the
  database owner (`trial.sh seed`; Sprint 41 — the API's own login may not remove demo rows),
  refused unless `APP_ENV=trial` and `DEMO_SEED=true`; upserts by SKU (`DEMO-…`), mobile
  (`90000900xx`) and licence; `--remove` (`trial.sh unseed`) takes it out while no demo
  order exists. Locally: `APP_ENV=trial DEMO_SEED=true TRIAL_DEMO_PASSWORD=… npx ts-node
  --transpile-only src/scripts/demoSeed.ts [--remove]` in `backend/`.

## 7d. Capacity (load test)

`scripts/load-test.sh` (with `. scripts/dev-env.sh` and a running API) seeds 500
throwaway products and measures the busiest customer paths with autocannon. Run it
before and after changes that touch search, product pages, cart or checkout.

Baseline, 1 Oct 2026, one 4-core machine, API compiled to JS, Postgres and Redis on
the same machine, 15 s per run (requests/second, median and 99th-percentile latency):

| Path | 10 users at once | 50 users at once |
| --- | --- | --- |
| Search | 824 req/s, 11 ms / 27 ms | 821 req/s, 59 ms / 85 ms |
| Category browse | 734 req/s, 13 ms / 23 ms | 696 req/s, 70 ms / 105 ms |
| Product page | 2,409 req/s, 3 ms / 9 ms | 2,705 req/s, 17 ms / 35 ms |
| Cart | 892 req/s, 10 ms / 18 ms | 934 req/s, 51 ms / 74 ms |
| Checkout preview, all buying the SAME batch | 98 req/s, 99 ms / 158 ms | 96 req/s, 512 ms / 611 ms |

Checkout of one batch is serialised on purpose (each order must reserve its own
units); different medicines check out in parallel. The first run found that
simultaneous checkouts of one medicine failed with "Insufficient stock" (they skipped
the locked batch); allocation now waits for the lock (5 s limit, then "please try
again") and takes locks in product order. Regression check: Sprint 5 smoke.

**Sprint 23 (forgiving search), same machine and method, old and new builds run
back to back against one otherwise idle database:**

| Path | 10 users: before → after | 50 users: before → after |
| --- | --- | --- |
| Search "para" | 880 → 703 req/s, p50 10 → 13 ms | 910 → 784 req/s, p50 53 → 61 ms |
| Category browse | 724 → 1,021 req/s | 742 → 866 req/s |
| Product page, cart, checkout preview | unchanged (within ±10 %) | unchanged |

The old search found **nothing** for "para" (full-text matching has no prefixes), so
it was cheap; the new one returns the 50 Paracetamol products. Compared on equal
work (search for "paracetamol", same 50 results, 10 users): 742 → 781 req/s. With a
15,000-product catalogue where one word matches 1,250 products: "paracetamol" 321 →
318 req/s (p50 30 ms); a misspelling that needs the typo pass ("paracetmol", 1,250
results) 110 req/s, p50 87 ms; a word that matches nothing ~900 req/s either way.

How search stays fast (services/search/): substring and full-text pass first, typo
(trigram) pass only when that finds nothing; ranking and stock only for matches, prices
and photos only for the page shown; named statements so Postgres plans each query shape
once per connection (planning was half the time). After a large catalogue import run
`VACUUM ANALYZE products` (autovacuum does it too, within minutes) so the trigram
indexes' statistics are current. If pg_trgm could not be installed (migration 21 warns),
search works without typo matching; to add it later, as a superuser:
`CREATE EXTENSION pg_trgm;` then the two `CREATE INDEX` statements in
`database/21_sprint23_search_trigram.sql` (the API notices within 5 minutes).

## 8. Before the first real customer

0. `APP_ENV=production` on the production API (section 2); no trial or demo setting
   anywhere. Demo data (`DEMO-` products, `90000900xx` logins) never in production.
1. Legal settings (Admin → Settings): entity, drug licences, pharmacist-in-charge,
   grievance officer. Licence register (Admin → Licences).
2. Policies published (Admin → Policies) after the lawyer's review (C-39).
3. Catalogue imported (Admin → Catalogue import, template `templates/01_…xlsx`) —
   add a "Manufacturer Address" column (C-17); expired sample batches are refused.
   Pharmacist approves product copy (Staff → Product copy, C-19).
4. Pharmacist logins with council registration numbers (Admin → users), then each one's
   council, valid-till and verification in Admin → Pharmacist registrations (Sprint 39);
   partners' pharmacists too. Products allowed for online sale by a pharmacist (Staff →
   Online-sale status; new products start "not allowed online yet").
5. Razorpay live keys, webhook (incl. `payment.authorized`), test payment and refund, and a
   test **prescription** order showing Authorized → Captured after the pharmacist's check
   (section 7f); MSG91 DLT template; SES out of sandbox.
6. Confirm the Sprint 5 defaults in `DECISIONS.md` (return windows, delivery code).
7. DLT templates registered and mapped for at least otp, dispatched, out_for_delivery,
   delivered, order_cancelled and return_update; Firebase service account; Shiprocket
   API user, webhook and pickup address (section 2).
8. Agora App ID and certificate; WhatsApp number and templates if WhatsApp is used;
   rider logins for own delivery.
9. `TOTP_ENC_KEY` set (section 2). Owner decision on two-step sign-in: recommended — every
   admin and super-admin switches it on, then Settings → "Two-step sign-in" → required
   (security review Sprints 35–40 #16: without it an SMS code alone resets an admin's password).
10. `HEALTH_ENC_KEY` set and kept in the secret store (section 6 "Health data key").
11. Doctor / hospital accounts: each registration verified with valid-till and the certificate
    copy (Admin → Doctor registrations, section 7h). The in-app signed requisition counts as the
    signed written order (owner decision CONFIRMED 2026-10-04, DECISIONS.md).
12. Approved cold-chain couriers entered (Admin → Settings → "Approved cold-chain couriers";
    DECISIONS.md 2026-10-03, Sprint 41): until then the dashboard warns
    `COLD_CHAIN_COURIERS_NOT_SET` and refrigerated parcels may go with any courier.
13. `PUBLIC_WEB_URL` set to the public website address (section 2, Teleconsultation) so the QR
    on e-prescriptions and links in messages open the right site.
14. The plain-English owner's list of everything above and the legal / policy items:
    `docs/LAUNCH_CHECKLIST.md` (Sprint 48) — live on **Admin → Launch readiness** since
    Sprint 49 (section 7l), which computes most items from the server.
15. Partner Nootan's stock feed: Allied will not export, so Nootan automates MediVision's own
    stock-report export with Power Automate Desktop (`docs/medivision-export-automation.md`)
    into a fixed `STOCK.xlsx` that the stock connector uploads (`docs/stock-connector.md`).
    Set the partner's *Stale after* window longer than the export interval (30 minutes for a
    15-minute export, 45 for 30).

## 9. Incidents

Log every security incident in Admin → Incidents as soon as it is detected. CERT-In
must be told within **6 hours** of detection for reportable incidents; a personal-data
breach also goes to the Data Protection Board and affected users (C-43). The register
shows each deadline and refuses to close a breach until the notices are recorded.

**Emergency stop for prescription medicines (Sprint 38).** If a government notification
or a regulator instruction requires it, a super-admin opens Admin → Emergency stop,
enters the reason and the reference (e.g. the notification number) and types PAUSE.
At once: retail buyers cannot add Schedule H / H1 medicines to the cart, check them out
or pay for an unpaid order holding them (they see a plain message and a banner on the
website and app); paid parcels holding them are held at dispatch for Dawabag and every
partner (pharmacists can still check and pack). Everything else keeps selling. Resume
the same way (type RESUME); both steps are in the audit log. Held orders the business
decides not to supply are cancelled and refunded from the order page as usual.
