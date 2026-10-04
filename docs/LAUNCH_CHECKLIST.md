# Dawabag — launch checklist (before real customers)

For the owner. Plain English; one line per job. **Who:** Owner, Lawyer, CA, Allied (Allied
Softtech), Developer. **Status** is what is known on 4 October 2026 from `DECISIONS.md`, the
RUNBOOK and the project notes — tick items off as they are done. Technical details for each
item are in the RUNBOOK section named in brackets. Nothing here is needed for the trial server;
all of it is needed before the first real order.

## 1. Legal and licences

| # | What has to be done | Who | Status |
| --- | --- | --- | --- |
| 1.1 | Company details, drug licences, pharmacist-in-charge and grievance officer entered in Admin → Settings; every licence in Admin → Licences (RUNBOOK §8 item 1) | Owner | Not done — needs the real licence copies |
| 1.2 | Lawyer confirms the licence form numbers the software uses: 20 / 21 retail, 20B / 21B wholesale, and the reading of 20C / 20D / 20F / 20G / 25B (DECISIONS 2026-09-30, Sprint 30 notes) | Lawyer | Pending lawyer |
| 1.3 | Lawyer confirms the Schedule C / C1 reading (Form 21 / 21B needed for insulin, vaccines etc.) (DECISIONS 2026-10-02, Sprint 34) | Lawyer | Pending lawyer |
| 1.4 | Written orders from doctors: an in-app signed requisition counts as the signed written order (r.65(9)(b)) | Owner | **Decided — confirmed by the owner 4 Oct 2026** (upload stays available) |
| 1.5 | Lawyer and CA sign off the compliance rulebook (C-01..C-46) and the Sprint 5 defaults (return windows, delivery code) (RUNBOOK §8 item 6) | Lawyer, CA | Pending |
| 1.6 | Decide which products are "doctors and hospitals only" or "licensed trade only" — a pharmacist then sets each one (RUNBOOK §7k) | Owner, pharmacist | Control built; nothing restricted yet (owner to decide) |

## 2. Payments

| # | What has to be done | Who | Status |
| --- | --- | --- | --- |
| 2.1 | Razorpay live keys and webhook (including `payment.authorized`) in the server's secret store (RUNBOOK §2, §8 item 5) | Owner, Developer | Not done |
| 2.2 | Test payment and refund, and a prescription order showing "held" then "charged" after the pharmacist's check (RUNBOOK §7f, §8 item 5) | Owner | **Pending owner UAT** — the owner runs it once ready (only a stand-in gateway tested so far) |
| 2.3 | CA confirms GST invoice details, credit notes and the GST reports (invoice now issued at the pharmacist's approval) (RUNBOOK §7h) | CA | Pending |
| 2.4 | E-invoice (IRP) sandbox test with the GST portal credentials (RUNBOOK §2) | Owner, CA | Not done |

## 3. SMS and WhatsApp

| # | What has to be done | Who | Status |
| --- | --- | --- | --- |
| 3.1 | MSG91 account key and DLT sender / templates registered and mapped for at least: sign-in code, dispatched, out for delivery, delivered, order cancelled, return update (RUNBOOK §2 "SMS (MSG91, DLT)", §8 item 7) | Owner | **In progress (owner)** — mostly registered earlier; owner to send details for checking / redoing |
| 3.2 | WhatsApp number and approved templates, only if WhatsApp will be used (RUNBOOK §2 "WhatsApp", §8 item 8) | Owner | Not started (optional) |
| 3.3 | Email (Amazon SES) moved out of sandbox (RUNBOOK §8 item 5) | Owner, Developer | Not done |

## 4. Server and secrets

| # | What has to be done | Who | Status |
| --- | --- | --- | --- |
| 4.1 | Production server set up (not the trial server), backups to the object store and a restore drill done (RUNBOOK §6, §7c) | Developer, Owner | Not started — only the trial server exists |
| 4.2 | `APP_ENV=production`, no demo data or demo logins (RUNBOOK §2, §8 item 0) | Developer | At production set-up |
| 4.3 | `HEALTH_ENC_KEY` (health details) and `TOTP_ENC_KEY` (two-step sign-in) generated once and kept safely in the secret store — losing them makes data unreadable (RUNBOOK §6 "Health data key", §2 "Two-step sign-in", §8 items 9–10) | Developer, Owner | Not done for production (the API refuses to start without them) |
| 4.4 | The API's own restricted database login and password (`DB_APP_PASSWORD`) (RUNBOOK §6) | Developer | At production set-up |
| 4.5 | `PUBLIC_WEB_URL` = the public website address, so e-prescription QR codes and links open the right site (RUNBOOK §2 "Teleconsultation", §8 item 13) | Developer | At production set-up |
| 4.6 | Shiprocket user, webhook and pickup address; Firebase (app notifications); Agora (video calls) (RUNBOOK §2, §8 items 7–8) | Owner, Developer | Not done |
| 4.7 | Android release signing key kept by the owner; app built for release (RUNBOOK §7b) | Owner, Developer | Pending owner |
| 4.8 | Stock feed from partner Nootan's billing software: Allied will not provide an export or API, so Dawabag / Nootan build their own way; meanwhile the partner portal stock import and the connector's manual mode work (`docs/stock-connector.md`, RUNBOOK §2) | Owner, Developer | **Own solution needed** (Allied declined, 4 Oct 2026) |

## 5. Data and catalogue

| # | What has to be done | Who | Status |
| --- | --- | --- | --- |
| 5.1 | Catalogue imported with manufacturer address; a pharmacist approves product text (RUNBOOK §8 item 3) | Owner, pharmacist | In progress |
| 5.2 | Each medicine allowed for online sale by a pharmacist (new products start "not allowed online yet") (RUNBOOK §8 item 4) | Pharmacist | In progress |
| 5.3 | Schedule C / C1 marked on every product it applies to (never guessed from the name) (DECISIONS 2026-10-02) | Pharmacist | Pending |
| 5.4 | Imported medicine information and catalogue suggestions checked and approved by pharmacists (RUNBOOK §7i, §7j) | Pharmacists | In progress |
| 5.5 | Approved cold-chain courier list entered (Admin → Settings) — until then fridge items can go with any courier (RUNBOOK §8 item 12) | Owner | Not done (couriers not contracted yet) |

## 6. Staff set-up

| # | What has to be done | Who | Status |
| --- | --- | --- | --- |
| 6.1 | Pharmacist logins, and each pharmacist's council, registration number and valid-till entered and verified; partners' pharmacists too (RUNBOOK §8 item 4) | Owner, Admin | Pending — needs the registration certificates |
| 6.2 | Every admin, super-admin, pharmacist, packer and every partner login switches on two-step sign-in; then the super-admin sets Settings → "Two-step sign-in" to **required** (RUNBOOK §2 "Two-step sign-in", §8 item 9) | Owner, staff | Built; still "optional" — switch to required before launch (applies to all partner logins, confirmed 4 Oct 2026) |
| 6.3 | Doctor / hospital accounts: each registration verified with valid-till and the certificate copy (RUNBOOK §7h, §8 item 11) | Admin | As doctors sign up |
| 6.4 | Rider logins if Dawabag delivers itself (RUNBOOK §8 item 8) | Owner | Not started |

## 7. Policies

| # | What has to be done | Who | Status |
| --- | --- | --- | --- |
| 7.1 | The five policies — Terms, Privacy, Shipping, Cancellation and Refund — reviewed by the lawyer and published in Admin → Policies (English; Marathi / Hindi as decided) (RUNBOOK §8 item 2) | Lawyer, Owner | **Not published** (Shipping and Cancellation / Refund drafts exist for review) |
| 7.2 | An unpaid "pay the difference" after an order change does not time out | Owner | **Decided — confirmed 4 Oct 2026** |

## 8. Testing

| # | What has to be done | Who | Status |
| --- | --- | --- | --- |
| 8.1 | Owner's walk-through on the trial server: buyer, doctor, partner, pharmacist and admin journeys (RUNBOOK §7e) | Owner | Ongoing |
| 8.2 | Real-money test order end to end: pay, pharmacist approves (invoice issued), pack, dispatch, deliver, return / refund (RUNBOOK §7f, §7h) | Owner | Pending (after 2.1–2.2 and 3.1) |
| 8.3 | Security: internal reviews done up to Sprint 47 (`docs/security/`); an external penetration test before launch | Developer, external tester | Internal done; external pending |
| 8.4 | Automated tests green on the release (backend, website, browser tests) (RUNBOOK §7a) | Developer | Green on 4 Oct 2026 |
