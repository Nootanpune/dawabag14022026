# Technical Context

| Part | Stack | Folder |
| --- | --- | --- |
| API | Node.js + TypeScript, Express, PostgreSQL (`pg`), Redis (ioredis, Bull), zod | `backend/` |
| Web | Next.js 14 (App Router), Tailwind, zustand, axios | `frontend-web/` |
| Mobile | Flutter (flutter_riverpod, dio, go_router, file_picker, flutter_secure_storage for the refresh token only) | `mobile/` |
| DB schema | Plain SQL migrations, run in order | `database/01..06_*.sql` |
| Jobs | node-cron (IST) + Redis lock, runs recorded in `job_runs` | `backend/src/jobs/` |
| Integrations | Razorpay, MSG91, AWS S3/SES, FCM, IRIS IRP (e-invoice), Masters India GSTN, Surepass PAN | |

Package manager: npm (backend and web each have their own package-lock.json).

## Commands
```bash
# backend
cd backend && npm install
npx tsc --noEmit            # typecheck
npm test                    # jest unit tests (src/**/*.test.ts)
npm run dev                 # API on :4000 (needs Postgres + Redis + .env)
npm run test:smoke          # Sprint 1–10 end-to-end checks against a running API (DISABLE_SCHEDULER=true).
                            # Sprints 3, 5, 8–10 need fake providers: eval "$(node test/fakes/fake-env.mjs)" in the shell
                            # that starts the API and runs the tests (MSG91, Google OAuth/FCM, Shiprocket, IRP, Razorpay fakes)
                            # (API_URL, DATABASE_URL, REDIS_URL). Uploads need S3;
                            # without it the tests expect 503 and seed document rows.
# database
for f in database/0*.sql; do psql -U dawabag_user -d dawabag -f "$f"; done
# web
cd frontend-web && npm install && npx tsc --noEmit
NEXT_PUBLIC_API_URL=http://localhost:4000 npx next build
```
Flutter is not installed in the cloud dev environment; mobile code cannot be compiled there.

## Environment
See `backend/.env.example`. Documents go only to S3 (`AWS_S3_BUCKET`, optional
`S3_ENDPOINT`); there is no local storage option. `DISABLE_SCHEDULER=true` turns
off the cron jobs on an instance. Test databases/caches are throwaway servers.
No MSG91 key → SMS is skipped with a warning (OTP is in Redis at `otp:<mobile>`).

- Sprint 13: `agora-token` (RTC tokens). Env `MSG91_WHATSAPP_NUMBER`; fake WhatsApp endpoint in `test/fakes/server.mjs`.
- Sprint 15: `scripts/dev-env.sh` (source; throwaway dev/CI env + fake providers) and `scripts/dev-up.sh`
  (Postgres, Redis without snapshots, role/db, migrations, API → /tmp/dawabag-api.log). CI:
  `.github/workflows/ci.yml` (backend tsc, jest, migrations ×2, all smoke suites; web tsc, lint, build;
  Node 20, postgres:16, redis:7 services). `X-Request-Id` middleware (`middleware/requestId.ts`);
  job-failure alert `alertFirstFailure` in `jobs/scheduler.ts` (notification type `job_failed`).
- Sprint 16: web on Next.js 15.5.27 + React 19 (next-themes 0.4, sonner 1.7, lucide-react 0.460; override
  next>postcss ^8.5.28); backend without nodemailer (SES SendEmailCommand), uuid 11 forced via overrides;
  npm audit 0 on both. CI jobs: backend, web, mobile (flutter analyze/test), images (docker build + /ready).
  Migration 18: indexes for hot child lookups and batch-key expressions.
- Sprint 50: deployments — `deploy/staging/compose.yml` is the one stack (staging, trial with profile
  `objectstore`, production with the override `deploy/production/compose.production.yml` through
  `deploy/production/prod.sh`). Production settings: `PRODUCTION_ENV` GitHub environment secret
  (`make-production-env.sh`, checked by `check-env.sh`); deploy `.github/workflows/deploy-production.yml`
  (manual, environment `production`, CI must be green); monitor `production-monitor.yml`; backups
  client-side encrypted (`BACKUP_ENC_KEY`, `deploy/staging/backup/crypt.mjs`, `npm test` there).
  `PAYMENTS_TEST_MODE` (production refuses rzp_test_ keys without it). Guide: `docs/PRODUCTION.md`.
