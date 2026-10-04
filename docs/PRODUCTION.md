# Dawabag — going live on a production server

Sprint 50. Part A is the owner's plain-English guide, in the order you do things. Part B is the
technical runbook for the developer / operator. The kit itself is in `deploy/production/`, the
deploy button is the GitHub workflow **Deploy production**, and the live to-do list is
**Admin → Launch readiness** (items 4.1–4.13 cover this guide; `docs/LAUNCH_CHECKLIST.md`).

Nothing here touches the trial server: the trial stays as it is until you switch it off.
Placeholders: `www.example.com`, `api.example.com` and `example.com` stand for your real names
(e.g. `www.dawabag.com`, `api.dawabag.com`, `dawabag.com`). Prices are rough guides from
October 2026 — check the provider's price page on the day.

---

## Part A — the owner's go-live guide

### A1. What you are setting up

- **One server in India** runs the website, the API (the app's server), the database,
  the cache and the HTTPS front door (Caddy, which gets and renews certificates itself).
- **AWS in Mumbai (ap-south-1)** keeps prescriptions, KYC documents and product photos (S3)
  and sends e-mail (SES). The software requires this on production: documents never leave
  India (C-44) and production refuses any other file store.
- **Backups**: every night at 02:30 IST the database is copied, **encrypted on the server
  first**, to a separate bucket in a **second Indian region** (Hyderabad, ap-south-2).
  Daily copies are kept 35 days, the first of each month 8 years (GST books, C-34).
- **GitHub** holds the code, runs the tests, and deploys only when you press the button and
  approve it. The secrets live in GitHub's "production" environment and in your password
  manager — nowhere else.
- **Alerts**: the server tells every admin (e-mail + app) when a backup is late or failed or the
  nightly record check stopped; GitHub opens an issue (and e-mails you) when the site is down.

### A2. Choose the hosting

**Recommendation (proposed — DECISIONS.md, confirm):** a separate **AWS account for Dawabag
only**, everything in **Mumbai**: one server (EC2, or a Lightsail bundle) + S3 + SES, backups
in Hyderabad. Reasons: the software needs AWS S3 and SES in Mumbai anyway, so one provider,
one bill and one place for access keys; same-region traffic to S3; and Dawabag stays in its own
account, away from any other servers you run — nobody can pick the wrong machine.

| Option | Size for launch | Rough monthly cost |
| --- | --- | --- |
| **AWS EC2, Mumbai** (recommended) | 4 vCPU, 16 GB (e.g. m6a.xlarge) or 4 vCPU / 8 GB (c6a.xlarge); 100 GB gp3 disk; Elastic IP | about US$110–135 on demand (≈ ₹9,500–11,500); 30–40 % less with a 1-year Savings Plan |
| AWS Lightsail, Mumbai | 4 vCPU, 16 GB, 320 GB bundle | about US$84 (≈ ₹7,200) |
| DigitalOcean, Bangalore (cheaper, the trial's provider) | Basic / Premium 4 vCPU, 8 GB, 160 GB | about US$48–64 (≈ ₹4,100–5,500) |
| Add-on: the provider's own server snapshots ("managed backups") | daily, 7 kept | EC2 snapshots ≈ US$5–10; Lightsail ≈ US$5–10; DigitalOcean +20–30 % of the server |
| AWS S3 + SES + backup bucket | launch volumes | usually under US$10–20 |

Sizing: 4 vCPU and 8 GB is the minimum (the images are built on the server; the October 2026
load test served ~800 searches a second on one 4-core machine, RUNBOOK §7d); 16 GB is
comfortable. Turn on the provider's daily snapshots: they restore the whole server quickly; our
own encrypted nightly backups remain the record you restore data from.

If you choose DigitalOcean instead: create a **new project used only for Dawabag**, and
never select, resize or delete any droplet that already exists in the account.

### A3. Prepare the server (about 20 minutes)

1. Create the server: **Ubuntu 24.04 LTS**, Mumbai (or Bangalore), the size above, with
   **your own SSH key** (the provider asks for it). AWS: give it an **Elastic IP**, and a
   security group allowing only TCP 22, 80, 443. Name it `dawabag-production`.
2. Log in as root (or `ubuntu` then `sudo -i`) and run the preparation script from the release
   you are going to deploy (read it first — it is short):
   ```
   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/<tag>/deploy/production/bootstrap-server.sh -o bootstrap.sh
   bash bootstrap.sh --admin-user ops
   ```
   It installs Docker, the firewall (only 22/80/443), fail2ban, automatic security updates
   (with a reboot at 03:30 IST when needed), swap, time sync (clock in UTC; you see IST too),
   log keeping (200 days, CERT-In asks for 180), a `dawabag` deploy user and an `ops` admin
   user, and switches SSH to keys only with **no root login**. It is safe to run again.
3. It prints three values. Keep the window open for step A4.
   From now on you log in as `ssh ops@<server address>`.

### A4. Secrets (about 30 minutes)

1. In GitHub → the repository → **Settings → Environments → New environment** → `production`.
   - **Required reviewers:** add yourself (every deploy then waits for your approval).
   - **Deployment branches and tags:** "Selected" → the default branch and tags `v*`.
2. In that environment add the **environment secrets** printed by the bootstrap script:
   `PRODUCTION_SSH_HOST`, `PRODUCTION_SSH_KNOWN_HOSTS`, `PRODUCTION_SSH_KEY`.
3. On a trusted computer (or the new server), make the settings file — every password and key
   is generated for you:
   ```
   deploy/production/make-production-env.sh --web www.example.com --api api.example.com \
     --apex example.com --email you@example.com
   ```
   Copy everything it prints into **two places only**: the environment secret
   **`PRODUCTION_ENV`**, and a secure note **"Dawabag PRODUCTION_ENV"** in your password manager.
4. Fill the blanks marked `FILL IN` in both copies (Part B, B3 shows where each comes from):
   AWS keys and bucket names, the SES sender, Razorpay **live** keys (A7), MSG91 (A8); Firebase,
   Shiprocket, Agora and e-invoice keys when you have them (the site works without them; those
   features stay off). Check it: `deploy/production/check-env.sh <file>` — it names what is
   missing or unsafe and never prints a value.

**Never lose these three** (the guide prints the same warning):
`TOTP_ENC_KEY` (lost → every staff/partner authenticator stops working),
`HEALTH_ENC_KEY` (lost → buyers' health details are unreadable),
`BACKUP_ENC_KEY` (lost → **every backup** made with it is unreadable, including the 8-year
monthly copies). Never reuse anything from the trial's `TRIAL_ENV`.

### A5. DNS at BigRock for your domain — without breaking your e-mail

Your domain's e-mail works through records in the same DNS zone. Changing the wrong record
stops e-mail. So:

1. **Before anything:** BigRock → Domain → **Manage DNS** → take screenshots of **every**
   record (especially **MX**, and TXT records starting `v=spf1`, `v=DMARC1`, DKIM records).
   **Do not change the nameservers** and **do not touch MX, SPF, DKIM or DMARC records.**
2. A day before go-live, lower the TTL of the records you will change to 300 seconds (if the
   panel allows).
3. Add (or change) only these:

   | Type | Host | Value | Notes |
   | --- | --- | --- | --- |
   | A | `www` | the server's IPv4 address | the website |
   | A | `api` | the same address | the API (the app talks to it) |
   | A | `@` (bare domain) | the same address | only if the bare domain may point here; it redirects to `www`. If a website already runs on the bare domain elsewhere, leave it and set `APEX_DOMAIN=` empty |
   | AAAA | `www`, `api` (`@`) | the server's IPv6 address | **only** if the server really has IPv6 switched on; a wrong AAAA breaks the site for many mobile users |
   | CAA | `www` and `api` | `0 issue "letsencrypt.org"` | optional hardening; if BigRock's panel has no CAA type, skip it. Do **not** put CAA on `@` unless you know no other service of yours uses certificates from another authority |

4. SES (sending e-mail as your domain): AWS SES → Identities → your domain gives **three CNAME
   records** (DKIM). Add them; they do not affect your existing mail. Do **not** edit the SPF
   record for SES unless you set a custom MAIL FROM subdomain (Part B, B3).
5. After the change: send yourself an e-mail from outside and reply to it — your mailbox
   must still work. Then mark Launch readiness 4.11 done.

### A6. First deploy

1. Make sure CI is green for the commit, and give it a tag (GitHub → Releases → "Draft a new
   release" → tag e.g. `v2026.10.1`).
2. GitHub → **Actions → Deploy production → Run workflow** → `ref`: the tag → Run.
3. Approve it when GitHub asks (you are the required reviewer).
4. The run checks the settings, copies the code, builds, backs up (nothing to back up the first
   time), migrates, starts everything, waits for HTTPS, takes the first backup and checks the
   site from inside and outside. The summary shows the addresses and the Razorpay webhook URL.
5. Sign up on the website with your own mobile, then on the server:
   `sudo -iu dawabag dawabag/deploy/production/prod.sh first-admin <your mobile>` — it makes that
   account the **first** super-admin (refused once one exists; audited). Switch on two-step
   sign-in for it at once; further staff are added in Admin → Users.
6. Open **Admin → Launch readiness** and work through what is left.

### A7. Razorpay: switching to live

1. Razorpay Dashboard → **Activate account**: complete KYC (business PAN, GST, bank account,
   business proof). For a pharmacy Razorpay usually asks for the **drug licences** and checks
   the website: **publish the Terms, Privacy, Shipping, Cancellation and Refund policies first**
   (Admin → Policies, checklist 7.1) and keep contact details visible.
2. After approval switch the dashboard to **Live mode** → Account & Settings → **API keys** →
   Generate. Put the Key Id (`rzp_live_…`) and Secret in `RAZORPAY_KEY_ID` /
   `RAZORPAY_KEY_SECRET` (both copies of PRODUCTION_ENV).
3. Live mode → **Webhooks** → Add: URL `https://api.example.com/api/v1/payments/webhook`,
   events `payment.authorized`, `payment.captured`, `payment.failed`, `refund.processed`,
   `refund.failed`, `token.confirmed`, `token.rejected`, `token.cancelled`; choose a secret and
   put it in `RAZORPAY_WEBHOOK_SECRET`.
4. **Payment capture:** leave the dashboard on automatic capture. Prescription orders are
   created with *manual* capture by the software (authorise now, charge after the pharmacist's
   check, Sprint 39, RUNBOOK §7f); the per-order setting overrides the dashboard. Check it once:
   a prescription order must show **Authorized** until the pharmacist approves, then
   **Captured**; a refused order is never charged.
5. Deploy again (A6). Production **refuses test keys** — except on a declared dry-run day:
   `PAYMENTS_TEST_MODE=true` with `rzp_test_…` keys (then live keys are refused). See A11.
6. Do one real small order end to end and refund it (checklist 2.2, 8.2).

### A8. MSG91 (SMS) live

1. DLT (Jio / Airtel / Vi portal): principal entity, the sender header, and a template for each
   message — sign-in code, dispatched, out for delivery, delivered, order cancelled, return
   update (checklist 3.1).
2. MSG91: link the DLT entity and header, add each template with its DLT template id, copy the
   **auth key**. Put `MSG91_AUTH_KEY`, `MSG91_SENDER_ID` (the header) and `MSG91_TEMPLATE_OTP`
   in PRODUCTION_ENV and deploy.
3. Admin → Settings → SMS templates: map each message type to its template and variables
   (RUNBOOK §2 "SMS"). Test: "Sign in with a code" to your own phone.

### A9. Play Store release

1. **Upload key** (once, on a trusted computer; RUNBOOK §7b): create it with `keytool`, keep
   the `.jks` file **and** its password in the password manager (plus one offline copy, e.g. an
   encrypted USB in a safe). Put it in GitHub secrets `ANDROID_KEYSTORE_BASE64`,
   `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
2. Play Console: create the app (application id `com.dawabag.app` — it can never change),
   enable **Play App Signing** (Google keeps the app signing key; a lost upload key can then be
   replaced through Play support). Complete the Data safety form, the health-app declarations and
   whatever Google's current policy requires for apps selling medicines in India.
3. Build: Actions → Deploy production → tick **build_aab** (or run it with the same tag after the
   deploy) → artifact `dawabag-production-aab`, pointed at `https://api.example.com`. Its version
   code is "minutes since 1970", always higher than the CI test builds.
4. Upload to the **Internal testing** track first; install from the Play link on a few phones
   and walk every journey against production; then Closed testing, then Production.

### A10. Trial data: do not copy it

**Recommendation (proposed — DECISIONS.md):** production starts **empty**; nothing is copied
from the trial. The trial holds demo products and logins, placeholder licences (C-04), demo
payments and test invoices; copying it would put fake entries into the statutory registers
(the H1 register and audit chains, C-09 / C-46), use up invoice numbers of the GST series
(CGST Rule 46), and carry test passwords and keys into production.

Re-enter on production (each is a screen you already know from the trial):

- Admin → Settings: legal entity, GSTIN, drug licences, pharmacist-in-charge, grievance
  officer, SMS templates, courier pickup, cold-chain couriers, retention, two-step sign-in →
  **required** once staff are enrolled (checklist 1.1, 5.5, 6.2).
- Admin → Licences (every licence with its copy); Admin → Policies (publish after the lawyer's
  review, 7.1).
- Staff logins (new passwords; each switches on two-step sign-in), pharmacist registrations
  (6.1).
- Partners: onboard again (Admin → Partners) with their licences and pharmacists; **new**
  stock-feed keys; point partner Nootan's stock connector at the production API with the new
  key (`docs/stock-connector.md`).
- Catalogue: import the same master spreadsheets you used for the trial (Admin → Catalogue
  import), product photos (bulk upload), medicine information drafts (import) — then
  pharmacists approve them **again on production** (approvals on the trial do not count).
- Opening stock (or the partner stock import), then switch off `catalogue.opening_stock_open`.
- Launch readiness manual items: record their status again with notes.

Keep the trial running until production is live, then switch it off (and delete its droplet)
— it never held real customers.

### A11. Cut-over checklist

- **One week before:** server prepared (A3), AWS buckets / keys / SES (B3), PRODUCTION_ENV
  stored (A4), Razorpay KYC submitted (A7), DLT templates (A8), lawyer's policies ready.
- **Dry-run day (optional, recommended):** deploy with `PAYMENTS_TEST_MODE=true` and Razorpay
  **test** keys to the real domain; walk every journey with test cards. Afterwards the developer
  **wipes the production database once** (B9) so no test invoice or register entry stays — then
  remove `PAYMENTS_TEST_MODE`, put the live keys in, deploy again. Never wipe after real data.
- **Two days before:** DNS records added (A5) and e-mail tested; first deploy done; Launch
  readiness reviewed; data entry (A10) in progress.
- **Go-live day:** tag the release; deploy; `check` all green; real small payment + refund;
  sign in by SMS code; one prescription order through the pharmacist's check (Authorized →
  Captured); one dispatch with the courier; Admin → Jobs: `ops_watch`, `chain_verify` and
  backups green. Set the GitHub variables for the monitor (B6) and run it once.
- **After:** Play Store production track; switch off the trial; mark 4.1–4.13 in Launch
  readiness.

### A12. Rollback

- **Something wrong after a deploy:** Actions → Deploy production → `ref` = the **previous tag**
  → Run. The previous two releases' images stay on the server, so it is quick. Database changes
  (migrations) only ever add, so the previous release normally runs on the newer database.
- **If a deploy fails** the workflow stops and prints the logs: a failure while building, backing
  up or migrating leaves the previous release serving; read the summary for what to do.
- **Restore the database** only if a migration damaged data: every deploy takes a backup just
  before migrating (its key is in the run's log, "backup ok: …"). Restoring loses everything
  entered after that backup, so it needs **your written approval and an incident entry**, and the
  developer follows RUNBOOK §6 "Restore drill" (`prod.sh restore-live <key>`). Prefer a forward
  fix whenever possible.

### A13. Routine checks

| When | What (about) |
| --- | --- |
| **Daily** (5 min) | Admin dashboard warnings; Admin → Jobs — `ops_watch`, `chain_verify` green; no open GitHub issue labelled `production-alert`; Admin → Notification deliveries (failed SMS / e-mail); Admin → Refunds and E-invoices (nothing stuck) |
| **Weekly** | `prod.sh status` (disk under 70 %); the payment-reconciliation report (Accounts); Admin → Security incidents; fail2ban and update reboots (`last reboot`) |
| **Monthly** | the month's first backup is in `backups/monthly/YYYY/MM/` of the backup bucket; review who has admin roles; GST period lock after filing (RUNBOOK §2) |
| **Quarterly** (Jan, Apr, Jul, Oct) | restore test `prod.sh restore-check`, logged in the ops log (once a year also the oldest monthly backup); rotate the AWS access keys of people who left |

### A14. When the site is down

1. The GitHub issue says what failed (API, website or certificate).
2. Log in: `ssh ops@<server>` → `sudo -iu dawabag dawabag/deploy/production/prod.sh status`
   and `… prod.sh logs api` (or `web`, `caddy`, `postgres`).
3. Server unreachable: the provider's console (is it running? reboot it). Disk full:
   `prod.sh tidy`, `sudo journalctl --vacuum-size=5G`. A bad release: A12.
4. A security incident (data exposed, account taken over): Admin → Security incidents at once —
   CERT-In within **6 hours** for reportable incidents (C-43, RUNBOOK §9).

---

## Part B — technical runbook

### B1. The kit

| File | What it is |
| --- | --- |
| `deploy/staging/compose.yml` | the one stack definition (shared with staging and the trial): postgres, redis, `migrate` (owner, one-shot), `api` (restricted login), `web`, `backup`, `caddy` |
| `deploy/production/compose.production.yml` | thin override: project `dawabag-production`, `APP_ENV=production` forced, release-tagged images (`dawabag-production-{api,web,backup}:<release>`), `QUEUE_PREFIX` / `BACKUP_ENC_KEY` / `BACKUP_S3_BUCKET` required, backup secrets blanked for the API and `migrate`, the bare domain redirected to `www` |
| `deploy/production/production.env.example` | every setting, secrets as placeholders, third-party keys as `FILL IN` blanks |
| `deploy/production/make-production-env.sh` | prints a PRODUCTION_ENV with fresh secrets (stdout only) and where to store it |
| `deploy/production/check-env.sh` | refuses unsafe settings (names and line numbers only); run by the workflow, by `prod.sh build` and by CI |
| `deploy/production/bootstrap-server.sh` | one-time, idempotent server hardening (A3) |
| `deploy/production/prod.sh` | the server-side commands (`build`, `pre-backup`, `up`, `ready`, `first-backup`, `check`, `backup-now`, `restore-check`, `restore-live`, `first-admin`, `dblogin`, `release`, `status`, `logs`, `tidy`, `stop`); **no** `seed`, `unseed` or `reset` |
| `deploy/production/test-kit.sh` | self-test without a server (CI job `production-kit`) |
| `.github/workflows/deploy-production.yml` | manual deploy in the `production` environment |
| `.github/workflows/production-monitor.yml` | outside uptime / certificate watch every 10 minutes |
| `deploy/staging/backup/crypt.mjs` | client-side AES-256-GCM for backups (`BACKUP_ENC_KEY`) |

The API itself refuses unsafe production settings at start-up (`backend/src/config/env.ts`):
with `APP_ENV=production` no demo seed / demo payments / trial password /
`ALLOW_MISSING_INTEGRATIONS` / `S3_ENDPOINT`, `AWS_REGION=ap-south-1`, `TOTP_ENC_KEY` and
`HEALTH_ENC_KEY` required, the restricted database login required (Sprint 41), and since
Sprint 50 **Razorpay test keys refused unless `PAYMENTS_TEST_MODE=true`** (which then refuses
live keys). `check-env.sh` applies the same rules before anything reaches the server.

### B2. How a deploy runs

1. **verify** (no secrets): resolves the ref to a commit; requires a **successful run of
   `ci.yml` for that exact commit** (GitHub API with the job's `GITHUB_TOKEN`) and the commit to
   be on the default branch (unless `allow_unmerged`, for emergencies).
2. **deploy** (environment `production` → waits for the required reviewer): `check-env.sh` on
   `PRODUCTION_ENV`; SSH with the pinned host keys (no trust-on-first-use) and one multiplexed
   connection; `rsync` of the commit (the server's `production.env` is protected); the settings
   file written with `DAWABAG_RELEASE=<12-char sha>` appended (mode 600).
3. On the server: `prod.sh build` (check-env again; `docker compose build --pull`; the live site
   keeps serving) → `pre-backup` (a full encrypted backup; skipped only when no database exists
   yet; a backup failure stops the deploy) → `up`: postgres and redis first, then
   **migrations in a one-off container** while the previous API still serves (a failing
   migration stops the deploy with the old release up — the runner rolls back the failing file's
   transaction), then `up -d --wait` for the API, website, backups and Caddy (a short interruption
   while the API container is replaced) → `ready` → `first-backup` → `check` (deploy/staging/check.sh
   incl. the bare-domain redirect and backup age) + `dblogin` → the same checks from outside →
   `tidy` (keeps the current and two previous releases' images).
4. On failure: status, release, and logs of migrate / api / web / caddy / backup, and the
   rollback advice in the run summary.
5. **android** (optional): signed AAB with the CI upload-key secrets, `API_URL` =
   `https://<API_DOMAIN>`, version code = minutes since epoch.

Verified locally (Sprint 50) with the real API image: production API started as `dawabag_api`
with queue prefix `dawabag-production`; encrypted first backup and pre-deploy backup; restore
check decrypted and restored; check.sh green apart from host-only port noise; a deliberately
failing migration stopped the deploy with the previous API still serving and `/ready` OK.

### B3. AWS set-up (Mumbai + Hyderabad)

Create a dedicated AWS account (or at least a dedicated IAM area) for Dawabag; turn on MFA for
the root user and every person.

- **Documents bucket** (ap-south-1), e.g. `dawabag-documents-prod`: Block Public Access (all
  four), versioning on, default encryption SSE-S3. No bucket policy — the website gets only
  short-lived signed links from the API.
- **Backup bucket** (ap-south-2 Hyderabad), e.g. `dawabag-backups-prod`: Block Public Access,
  versioning on, default encryption; lifecycle rule
  `aws s3api put-bucket-lifecycle-configuration --bucket dawabag-backups-prod --lifecycle-configuration file://deploy/staging/backup-lifecycle.json`
  (daily 35 days, monthly 8 years, monthly copies to Glacier Instant Retrieval after 30 days —
  drop `Transitions` if the class is not offered there). Optional and stronger: create the bucket
  with **Object Lock** (governance mode, 35 days default retention) so even a stolen key cannot
  delete recent backups.
- **IAM user `dawabag-api`** (keys → `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`):
  ```json
  {"Version": "2012-10-17", "Statement": [
    {"Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
     "Resource": "arn:aws:s3:::dawabag-documents-prod/*"},
    {"Effect": "Allow", "Action": ["ses:SendEmail"], "Resource": "*",
     "Condition": {"StringEquals": {"aws:RequestedRegion": "ap-south-1"}}}]}
  ```
- **IAM user `dawabag-backup`** (keys → `BACKUP_AWS_ACCESS_KEY_ID` / `_SECRET_`), **no delete**:
  ```json
  {"Version": "2012-10-17", "Statement": [
    {"Effect": "Allow", "Action": ["s3:PutObject", "s3:GetObject", "s3:AbortMultipartUpload"],
     "Resource": "arn:aws:s3:::dawabag-backups-prod/*"},
    {"Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": "arn:aws:s3:::dawabag-backups-prod"}]}
  ```
- **SES** (ap-south-1): verify the domain (three DKIM CNAMEs at BigRock), set
  `AWS_SES_FROM_EMAIL` (e.g. `noreply@<domain>`), request **production access** (out of the
  sandbox, checklist 3.3). A custom MAIL FROM is optional: use a subdomain (e.g. `mail.<domain>`)
  with its own MX/SPF — never edit the bare domain's MX or SPF for it.
- **The server's own backups** (whole-disk): EC2 → Data Lifecycle Manager or AWS Backup, daily
  snapshots kept 7 days; Lightsail → automatic snapshots.

### B4. Backups in production

- Nightly at `BACKUP_AT` (02:30 IST), plus one before every deploy. `pg_dump` streams through
  AES-256-GCM on the server (`crypt.mjs`; key derived from `BACKUP_ENC_KEY` with HKDF-SHA256,
  random IV per object, authenticated) into the backup bucket with SSE on top. Nothing is
  written to the server's disk. Each run is noted in `job_runs` (`db_backup`).
- Object layout `DWBENC1\n | key id | IV | ciphertext | tag`; restores recognise it by its first
  bytes, so older unencrypted backups stay restorable. A wrong key, a changed byte or a cut-off
  object fails the restore check (and `--into-live` never swaps it in).
- **Key rotation:** put the current key in `BACKUP_ENC_KEY_PREVIOUS` (comma-separated if more),
  a new one in `BACKUP_ENC_KEY`, deploy. New backups use the new key; old ones still restore.
  Keep the old key in `_PREVIOUS` (and the password manager) for 8 years — the monthly copies
  live that long.
- Restore test: `prod.sh restore-check` (newest backup into a scratch database; row counts, last
  migration, chain heads). Live restore: `prod.sh restore-live <key>` (RUNBOOK §6 "Restore drill").
- The backup bucket may be another S3-compatible store in India (e.g. DigitalOcean Spaces
  Bangalore) with `BACKUP_S3_ENDPOINT=https://…` and a lifecycle rule (or `BACKUP_PRUNE=true`,
  which needs delete rights); `check-env.sh` warns to confirm the region.

### B5. Object store choice (documents)

**AWS S3 in Mumbai is the only document store production accepts today**: the API refuses
`S3_ENDPOINT` with `APP_ENV=production` and requires `AWS_REGION=ap-south-1` (C-44). DigitalOcean
Spaces Bangalore or a self-hosted MinIO would need an owner decision and a backend change
(allow an S3-compatible endpoint in an Indian region, signed links through its public address as
on the trial). MinIO on the same server is not recommended for production: documents and the
database on one disk is a single point of failure, and MinIO no longer publishes images (October
2025; the trial uses the Alpine project's build).

### B6. Monitoring and alerts

- **Inside (no new service):** job **`ops_watch`** (hourly at :40 IST, Sprint 50) reads the
  Launch-readiness facts and **fails** when the newest backup is over 26 hours old or its last
  attempt failed, or the nightly `chain_verify` has not run for 48 hours (a just-started server
  gets 26 / 48 hours' grace). A failing job alerts every admin once by e-mail and push
  (`job_failed`) and again only after it has succeeded once. A broken chain is alerted at once by
  `chain_verify` itself (`chain_break`). Every other job failure alerts the same way.
- **Outside:** `.github/workflows/production-monitor.yml` every 10 minutes: `https://<api>/ready`,
  the website, and both certificates (fails under 14 days left). It opens one issue labelled
  `production-alert` (assigned to `PRODUCTION_ALERT_ASSIGNEE`, so GitHub e-mails that person)
  and closes it on recovery. Repository **variables** `PRODUCTION_WEB_DOMAIN`,
  `PRODUCTION_API_DOMAIN`, optional `PRODUCTION_ALERT_ASSIGNEE`. Scheduled workflows run only from
  the default branch and GitHub pauses them after 60 days without repository activity (re-enable
  in Actions). Run it once by hand after go-live.
- **Optional:** UptimeRobot or Better Stack (free tiers) — HTTP(S) monitor on
  `https://<api>/ready` expecting 200 and on the website, 1–5 minute interval, alerts by e-mail /
  SMS / app. No agent on the server and no secret needed.

### B7. Logs

Containers log to the system journal (Docker `journald` driver), kept 200 days and capped at
`--journal-max` (20 GB default) — CERT-In's 180 days (C-43). `prod.sh logs api` or
`journalctl CONTAINER_NAME=dawabag-production-api-1 --since "2026-10-01"`. The API's logs carry
request ids, never secrets; Caddy's access log cuts e-prescription codes. Check the size weekly:
`journalctl --disk-usage`.

### B8. Security summary

Keys-only SSH, no root login, no password on any account, fail2ban on SSH, firewall 22/80/443
(and the cloud security group the same), automatic security updates with a nightly reboot window,
Docker publishes only Caddy's 80/443, HTTPS everywhere with HSTS, security headers (nosniff,
referrer policy, frame denial, Permissions-Policy), the API on its own restricted database login,
backup keys kept away from the API container, secrets only in the GitHub environment and the
owner's password manager, a pinned SSH host key for deploys, deploys only of green commits with a
human approval.

### B9. Wiping production before launch (dry-run day only)

Only **before any real data exists**, with the owner's written go-ahead, as `dawabag` on the
server:
```
cd ~/dawabag
export STACK_ENV_FILE=$PWD/deploy/production/production.env
docker compose -f deploy/staging/compose.yml -f deploy/production/compose.production.yml \
  --env-file deploy/production/production.env down
docker volume rm dawabag-production_postgres_data
```
Then empty the documents bucket's test files and the backup bucket's dry-run objects in the AWS
console, and deploy again. This is deliberately not a `prod.sh` command.

### B10. Known limits

- One server: a hardware or provider failure takes the site down until the server (or a
  snapshot) is restored. Moving the database to RDS and running two app servers behind a load
  balancer is the next step when volumes justify it (RUNBOOK §1 describes that layout).
- The database and backups are in India; the GitHub runners that build the Android bundle and
  copy the code are not, but they never receive personal data.
- `docker compose` replaces the API container in place: a deploy causes a short interruption
  (well under a minute). Deploy outside shop hours.
