# Dawabag — owner decisions log

Decisions that change what gets built. Newest first. The compliance rule
numbers (C-xx) refer to the Dawabag Regulatory Compliance Rulebook
(https://claude.ai/code/artifact/472ce7a8-885a-4402-932e-010e211622f4, owner access).

| Date | Decision | Consequence for the software | Rule |
| --- | --- | --- | --- |
| 2026-09-30 | **Marketplace partners invoice as seller of record.** Dawabag is the platform; the licensed partner whose premises dispatch the goods issues the tax invoice. | Supersedes URS v3.1 "Dawabag invoices the customer, partner dispatches". Sprint 3 must build partner-issued invoices (partner GSTIN, drug licence and invoice series), commission/fee invoices from Dawabag to the partner, and TCS (CGST s.52) / TDS (s.194-O) in settlements. Orders fulfilled from Dawabag's own stock keep Dawabag as seller. | C-05, C-32, C-33 |
| 2026-09-30 | **Wholesale drug licences are Forms 20B / 21B** (not 20C / 21C). | `drug_license_type` values are `dl20`, `dl21` (retail) and `dl20b`, `dl21b` (wholesale) in the database, API, web and mobile. URS v3.1 text still says 20C/21C and needs a revision. | C-02, C-11 |
| 2026-09-30 | **No doctor referral rewards.** | `doctor_referrals` table, `doctor_profiles.bonus_points` and `GET /doctors/me/referrals` removed. Do not reintroduce any reward, discount or points for doctors tied to referrals or prescriptions. | C-20 |
