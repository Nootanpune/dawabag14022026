# Development Rules

- Read `docs/DECISIONS.md` and the Compliance Rulebook before changing pricing,
  prescriptions, KYC, invoices, marketplace or personal-data handling.
- New schema changes go in a new numbered file in `database/` (05_..., 06_...);
  keep migrations re-runnable (`IF NOT EXISTS`).
- Before committing backend changes: `npx tsc --noEmit` and `npm test` in
  `backend/`; for web changes `npx tsc --noEmit` in `frontend-web/`.
- Never commit `.env` files or real credentials.
