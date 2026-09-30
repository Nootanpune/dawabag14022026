# Dawabag — owner decisions log

Decisions that change what gets built. Newest first. The compliance rule
numbers (C-xx) refer to the Dawabag Regulatory Compliance Rulebook
(https://claude.ai/code/artifact/472ce7a8-885a-4402-932e-010e211622f4, owner access).

| Date | Decision | Consequence for the software | Rule |
| --- | --- | --- | --- |
| 2026-09-30 | **Standing rule: modular software, no monolithic HTML.** | No single-file HTML applications (as the earlier PharmaMES-style builds were). Code is split by responsibility: backend routes → controllers → services → utils; web pages built from components in `src/components/*` and logic in `src/lib/*`; mobile screens, widgets, providers and services in separate files. New features get their own modules, not additions to one large file. | — |
| 2026-09-30 | **Standing rule: the server is the single source of truth.** No local write/storage in any app or service: no files, blobs, JSON or databases on the device, browser or app-server disk. No data has two authorities. | All business data (cart, profile, customer type, KYC status, pincode, orders) lives only in PostgreSQL and is fetched from the API. Files (KYC documents, prescriptions, invoices) go only to the server object store (S3, ap-south-1). Web sessions use an httpOnly, Secure, SameSite cookie set by the server; mobile keeps only the refresh token in the OS keychain; access tokens live in memory. No localStorage, zustand persist, Hive, shared_preferences or local disk writes. | C-41, C-44 |
| 2026-09-30 | **Marketplace partners invoice as seller of record.** Dawabag is the platform; the licensed partner whose premises dispatch the goods issues the tax invoice. | Supersedes URS v3.1 "Dawabag invoices the customer, partner dispatches". Sprint 3 must build partner-issued invoices (partner GSTIN, drug licence and invoice series), commission/fee invoices from Dawabag to the partner, and TCS (CGST s.52) / TDS (s.194-O) in settlements. Orders fulfilled from Dawabag's own stock keep Dawabag as seller. | C-05, C-32, C-33 |
| 2026-09-30 | **Wholesale drug licences are Forms 20B / 21B** (not 20C / 21C). | `drug_license_type` values are `dl20`, `dl21` (retail) and `dl20b`, `dl21b` (wholesale) in the database, API, web and mobile. URS v3.1 text still says 20C/21C and needs a revision. | C-02, C-11 |
| 2026-09-30 | **No doctor referral rewards.** | `doctor_referrals` table, `doctor_profiles.bonus_points` and `GET /doctors/me/referrals` removed. Do not reintroduce any reward, discount or points for doctors tied to referrals or prescriptions. | C-20 |
