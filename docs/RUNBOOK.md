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
events `payment.*` and `refund.*`, copy the secret to `RAZORPAY_WEBHOOK_SECRET`.
Enable automatic capture.

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
- Database: RDS automated backups with point-in-time recovery; keep monthly snapshots
  for **8 years** (GST books 72 months, C-34). Test a restore every quarter.
- Statutory records are final in the database: the H1 register, credit notes, audit
  and consent logs cannot be updated or deleted; invoice amounts cannot change.
  A retention purge after the legal period runs in a session that first executes
  `SET LOCAL dawabag.maintenance = 'on'` — only with written approval.

## 7. Scheduled jobs

Run inside the API (IST): licence expiry, GSTIN re-check, low stock, credit
reminders, partner settlements, refills, licence register alerts. A Redis lock makes
each run happen once even with several API instances. Admin → Jobs shows runs and
can trigger one.

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

## 9. Incidents

Log every security incident in Admin → Incidents as soon as it is detected. CERT-In
must be told within **6 hours** of detection for reportable incidents; a personal-data
breach also goes to the Data Protection Board and affected users (C-43). The register
shows each deadline and refuses to close a breach until the notices are recorded.
