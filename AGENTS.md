## Project Rules

- **Standing rule — server is the single source of truth.** No local write or
  storage anywhere: no files, blobs, JSON or databases on the device, browser or
  app-server disk, and no data with two authorities. Clients fetch state from the
  API; files go only to the server object store. Web sessions: httpOnly cookie;
  mobile: refresh token in the OS keychain only. See `docs/DECISIONS.md`.
- **Standing rule — modular software.** No monolithic single-file HTML apps.
  Split code by responsibility (routes/controllers/services/utils; web
  components + lib; mobile screens/widgets/providers/services).
- This is the Dawabag online pharmacy (backend/, frontend-web/, mobile/, database/).
- Owner decisions: `docs/DECISIONS.md`. Legal requirements: the Dawabag Regulatory
  Compliance Rulebook (rules C-01..C-46) — cite rule numbers in code comments.
- Development rules: `.kilocode/rules/development.md`.

## Memory Bank Maintenance

After completing the user's request, update the relevant memory bank files:

- `.kilocode/rules/memory-bank/context.md` - Current state and recent changes
- Other memory bank files as needed when architecture, tech stack, or project goals change
