# Technical Context

| Part | Stack | Folder |
| --- | --- | --- |
| API | Node.js + TypeScript, Express, PostgreSQL (`pg`), Redis (ioredis, Bull), zod | `backend/` |
| Web | Next.js 14 (App Router), Tailwind, zustand, axios | `frontend-web/` |
| Mobile | Flutter (flutter_riverpod, dio, go_router, file_picker) | `mobile/` |
| DB schema | Plain SQL migrations, run in order | `database/01..04_*.sql` |
| Integrations | Razorpay, MSG91, AWS S3/SES, FCM, IRIS IRP (e-invoice), Masters India GSTN, Surepass PAN | |

Package manager: npm (backend and web each have their own package-lock.json).

## Commands
```bash
# backend
cd backend && npm install
npx tsc --noEmit            # typecheck
npm test                    # jest unit tests (src/**/*.test.ts)
npm run dev                 # API on :4000 (needs Postgres + Redis + .env)
npm run test:smoke          # end-to-end Sprint 1 checks against a running API
                            # (API_URL, DATABASE_URL, REDIS_URL; STORAGE_DRIVER=local on the API)
# database
for f in database/0*.sql; do psql -U dawabag_user -d dawabag -f "$f"; done
# web
cd frontend-web && npm install && npx tsc --noEmit
NEXT_PUBLIC_API_URL=http://localhost:4000 npx next build
```
Flutter is not installed in the cloud dev environment; mobile code cannot be compiled there.

## Environment
See `backend/.env.example`. Local development without AWS: `STORAGE_DRIVER=local`.
No MSG91 key → SMS is skipped with a warning (OTP is in Redis at `otp:<mobile>`).
