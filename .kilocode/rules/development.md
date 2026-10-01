# Development Rules

- **Server is the single source of truth (owner's standing rule).** Never add
  localStorage/sessionStorage, zustand `persist`, IndexedDB, Hive,
  shared_preferences, SQLite, or writes to local disk in any app or service.
  Session credential only: web httpOnly cookie, mobile refresh token in the
  keychain. Test/dev databases are servers the app talks to, not app storage.
- **Modular code (owner's standing rule).** No monolithic single-file HTML apps
  and no dumping new features into one large file; give each feature its own
  route/controller/service or component/lib module.
- Read `docs/DECISIONS.md` and the Compliance Rulebook before changing pricing,
  prescriptions, KYC, invoices, marketplace or personal-data handling.
- New schema changes go in a new numbered file in `database/` (05_..., 06_...);
  keep migrations re-runnable (`IF NOT EXISTS`).
- Before committing backend changes: `npx tsc --noEmit` and `npm test` in
  `backend/`; for web changes `npx tsc --noEmit` in `frontend-web/`.
- Never commit `.env` files or real credentials.
