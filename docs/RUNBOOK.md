# Dawabag — deployment and operations runbook

For the developer who deploys and runs Dawabag. Supersedes the deployment steps in
`Dawabag_Beta_Deployment_Guide.docx` where they differ (that guide predates the
migration runner and the Docker images). Owner decisions: `DECISIONS.md`; legal rules:
the Compliance Rulebook (C-xx).

## 1. What runs

| Piece | Image / source | Notes |
| --- | --- | --- |
| API | `backend/Dockerfile` (build from repo root) | Node 20, port 4000, applies DB migrations on start |
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

**SMS (MSG91, DLT).** Indian operators deliver only templates registered on DLT
(TRAI). Register each message in the DLT portal and MSG91, then map it in Admin →
Settings → SMS templates (message type → template id → variables). A message type
with no template is not sent by SMS; it is logged as *skipped* in Admin → Notification
deliveries, which also shows every failed SMS, email and push with the reason.

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
never re-run). The API container runs it before starting (`RUN_MIGRATIONS=false` to
skip). By hand: `npm run build && npm run db:migrate` (`-- --status` to list).

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
  and consent logs cannot be updated or deleted; invoice amounts cannot change.
  A retention purge after the legal period runs in a session that first executes
  `SET LOCAL dawabag.maintenance = 'on'` — only with written approval.

## 7. Scheduled jobs

Run inside the API (IST): licence expiry, GSTIN re-check, low stock, credit
reminders, partner settlements, refills, licence register alerts, payment and
e-invoice sweeps, recall-alert watch, retention purge. A Redis lock makes each run
happen once even with several API instances. Admin → Jobs shows runs and can trigger
one. When a job fails after working, admins get one alert (email and push); they are not
told again until it has succeeded once.

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
   (long random `DB_PASSWORD` and JWT secrets; test-mode Razorpay/MSG91 keys). The file
   stays on the server only (git ignores it).
3. `docker compose -f deploy/staging/compose.yml --env-file deploy/staging/staging.env up -d --build`
   — Caddy obtains HTTPS certificates by itself; the API migrates the database on start.
4. `WEB_DOMAIN=… API_DOMAIN=… deploy/staging/check.sh` — HTTPS, redirects, HSTS, CORS,
   request ids, closed database port.
5. Set the GitHub variable `MOBILE_API_URL=https://api-staging.dawabag.in` so test APKs
   reach it.

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

**Restore.** `deploy/staging/restore.sh latest` (or an S3 key) streams the dump into a new
database `dawabag_restore_check`, prints row counts of users, orders and products and the
last migration applied (next to the live database's), and drops the check database;
`--keep` keeps it for inspection. It never touches the live database unless asked:
`--into-live` restores and checks first, refuses while anything (the API) is connected
to the live database, asks you to type its name, then swaps the restored copy in and
keeps the old one as `dawabag_pre_restore_<time>` — drop that by hand once the API is
verified. Steps: `docker compose … stop api` → `deploy/staging/restore.sh <key> --into-live`
→ `docker compose … start api` → `check.sh`.

**Quarterly restore test** (January, April, July, October; record the result in the
ops log): `deploy/staging/restore.sh latest`, and once a year the oldest monthly backup
as well; the counts must be plausible and the last migration must match the live one
(or be the one deployed at that backup's date). A failed restore test is an incident.

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

## 8. Before the first real customer

1. Legal settings (Admin → Settings): entity, drug licences, pharmacist-in-charge,
   grievance officer. Licence register (Admin → Licences).
2. Policies published (Admin → Policies) after the lawyer's review (C-39).
3. Catalogue imported (Admin → Catalogue import, template `templates/01_…xlsx`) —
   add a "Manufacturer Address" column (C-17); expired sample batches are refused.
   Pharmacist approves product copy (Staff → Product copy, C-19).
4. Pharmacist logins with council registration numbers (Admin → users).
5. Razorpay live keys, webhook, test payment and refund; MSG91 DLT template; SES out
   of sandbox.
6. Confirm the Sprint 5 defaults in `DECISIONS.md` (return windows, delivery code).
7. DLT templates registered and mapped for at least otp, dispatched, out_for_delivery,
   delivered, order_cancelled and return_update; Firebase service account; Shiprocket
   API user, webhook and pickup address (section 2).
8. Agora App ID and certificate; WhatsApp number and templates if WhatsApp is used;
   rider logins for own delivery.

## 9. Incidents

Log every security incident in Admin → Incidents as soon as it is detected. CERT-In
must be told within **6 hours** of detection for reportable incidents; a personal-data
breach also goes to the Data Protection Board and affected users (C-43). The register
shows each deadline and refuses to close a breach until the notices are recorded.
