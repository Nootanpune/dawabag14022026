# Security review — Sprints 25 to 33

Date: 2 October 2026 (Sprint 34). Reviewer: the developer (Claude), from the code on branch
`claude/dawabag-pharmacy-status-0h7mr3`. Scope: everything added in Sprints 25–33 on the
backend and the website — search and "did you mean", the prescriptions page and reuse,
buy again / cheaper options, demo payments and payment options, partner stock import,
admin partner onboarding with temporary passwords, catalogue drafts and the pharmacist
queue, drug licences of every party with scans and alerts, catalogue lists, selling
rights and live trade prices, process guards, medicine information versions and review,
substitutes, delivery date, trust pages, dose reminders, and the health profile. The
mobile app was not reviewed (another workstream).

Earlier reviews: Sprint 6 (money and access), Sprints 12–13 (in Sprint 14), Sprints 15–20
(in Sprint 21). Rule numbers (C-xx) are from the Dawabag Regulatory Compliance Rulebook.

## Summary

| Severity | Found | Fixed in Sprint 34 | Left (reason below) |
| --- | --- | --- | --- |
| High | 1 | 1 | 0 |
| Medium | 6 | 6 | 0 |
| Low | 10 | 7 | 3 |
| Information (checked, no issue) | 8 | — | — |

Every fix has a test: jest (`*.test.ts` named below) and `backend/test/sprint34.smoke.mjs`
(section "A", against the running API).

## Findings

Line numbers are after the fix.

| # | Severity | Where | Issue | Fix | Test |
| --- | --- | --- | --- | --- | --- |
| 1 | **High** | `backend/src/services/licences/register.service.ts:300, 316` (`attachDocument`, `documentLink`) | **Licence scans of other parties could be read and replaced (IDOR).** The ownership check was `row.vendor_id !== (owner.vendorId ?? null) && row.user_id !== (owner.userId ?? null)`. For a buyer both sides of the first comparison are NULL, so the `&&` was false and **any signed-in buyer** passed for **any other buyer's** licence; likewise any partner for any other partner's. `GET /users/me/licences/:id/document-url` returned a 5-minute link to another business's licence scan; `POST …/document` replaced it. C-41. | New `ownsLicence(row, owner)`: a partner owns rows of its vendor id, a buyer rows of its user id, nothing else. | `services/licences/ownership.test.ts`; smoke: buyer A → buyer B's scan 404, partner A → partner B's 404, partner → buyer's 404 |
| 2 | Medium | `backend/src/controllers/password.controller.ts:42`, `middleware/auth.middleware.ts:75, 117`, `controllers/auth.controller.ts:431` | **Changing the password did not end other sessions.** Only the session making the change was revoked; a refresh token on another phone or browser — including one opened by whoever knew an admin-set temporary password (Sprint 28) — stayed valid for 7 days. C-44. | `password_changed_at` is written from the API clock; every access token (authenticate, optionalAuth) and refresh token issued in an earlier second is refused ("Your password was changed. Please sign in again"). | `utils/sessionRevocation.test.ts`; smoke: phone's access and refresh tokens 401 after the laptop changes the password, new session works |
| 3 | Medium | `backend/src/utils/zipGuard.ts`; called at `services/partnerStockImport/readFile.ts:49`, `services/catalogueImport/parse.ts:79`, `services/recallAlerts/parse.ts:80` | **Zip bomb in .xlsx uploads.** exceljs (JSZip) unpacks every part in memory before any size check; a 5 MB upload by any partner login could expand to gigabytes and stop the API for everyone. | Before opening a workbook: at most 2,000 parts and 60 MB unpacked by the archive's directory, and each part is unpacked with a hard output cap (zlib `maxOutputLength`) so a part lying about its size is caught after at most its declared size. Plain 422 "could not be read safely". | `utils/zipGuard.test.ts` (honest and lying 70–200 MB bombs, real workbook passes); smoke: 80 KB file unpacking to 80 MB refused in < 5 s by partner import and admin catalogue import |
| 4 | Medium | `backend/src/services/partnerStockImport/delimited.ts:91` (`parseHtmlTable`) | **CPU denial of service with an HTML ".xls".** The lazy patterns `<tr[\s\S]*?<\/tr>` and `<t([dh])…>([\s\S]*?)<\/t\1>` re-scan to the end of the file for every unclosed tag: a 2–3 MB file of `<tr><td` kept the event loop busy for minutes. | Linear tokenizer (`<(\/?)(table\|tr\|td\|th)\b([^<>]*)>`, `[^<>]` never crosses the next tag), cells closed by the next cell / row / table tag, first table only, row cap. | `services/partnerStockImport/parsingLimits.test.ts` (400k unclosed tags < 3 s; ordinary tables unchanged); smoke: 2.1 MB file answered in < 5 s |
| 5 | Medium | `backend/src/services/partnerStockImport/readFile.ts:18, 57, 61`, `delimited.ts:41` | **Unbounded rows from CSV / sheets.** A 5 MB CSV of empty lines became ~5 million arrays before the 10,000-row check, and `Math.max(...rows)` then overflowed the call stack (500). | CSV and HTML parsing stop after the row limit (+ title/footer); a sheet with more filled rows is refused before it is walked; `reduce` instead of spreading rows. | `parsingLimits.test.ts`; smoke: CSV over the limit → 422 naming the limit |
| 6 | Medium | `backend/src/utils/documentCheck.ts`; `controllers/prescription.controller.ts:22`, `services/licences/register.service.ts:298`, `controllers/kycDocument.controller.ts:74` | **Uploaded documents typed by the browser's word, not their bytes.** Prescriptions (Sprint 25 page), licence scans (Sprint 30) and KYC documents were stored with whatever MIME type the client declared; an HTML page or script named `.png` reached the private store and pharmacists' / admins' browsers. C-41. | Magic bytes decide (PDF / JPEG / PNG); the declared type must match; the object is stored with the checked type; size checked on the bytes received. Prescription upload limited to one file per request. | `utils/documentCheck.test.ts`; smoke: HTML as PNG licence scan and as prescription photo → 400, PDF declared as PNG → 400 |
| 7 | Medium | `backend/src/services/healthProfile/healthProfile.service.ts:178` | **Pharmacists could read any order's health details at any time.** `GET /health-profile/orders/:orderId` (pharmacist_rx, pharmacist_pack) answered for delivered, cancelled or years-old orders — more than the check needs. C-41 (minimum necessary); each look was already audited (C-46). | Only for orders still being checked or packed (`pending_payment`, `confirmed`, `rx_pending`, `rx_verified`, `rx_rejected`, `packing`, `packed`); otherwise 409 in plain words. | `services/retention.sprint34.test.ts` (status list); smoke: open order 200 with the allergy, cancelled order 409 |
| 8 | Low | `backend/src/middleware/errorHandler.ts:21` | Error-log redaction looked at top-level body fields only; family members, licence rows and other nested health / identity fields were logged as sent. C-41. | Recursive redaction (depth 6, arrays to 20 items); added `licence_number`, `relationship`, `age_years`. | `middleware/errorHandler.test.ts` |
| 9 | Low | `backend/src/controllers/auth.controller.ts:341` | Login answered faster for an unknown mobile than for a wrong password (bcrypt skipped), telling which mobiles have accounts. | An unknown mobile costs one bcrypt comparison against a dummy hash; same message. | smoke: unknown mobile → same 401 "Invalid credentials" |
| 10 | Low | `backend/src/index.ts:120` | No upload-specific rate limit: prescriptions (10 MB), KYC / licence scans, stock and catalogue files counted only towards the general 200 requests / 15 min. | `uploadLimiter`: 40 uploads / 15 min per address (`UPLOAD_RATE_LIMIT_MAX`; dev/CI 5,000) on the upload routes only (not the later stock-import steps). | smoke: second API with a limit of 2 → third upload 429, search unaffected |
| 11 | Low | `backend/src/controllers/product.controller.ts:23, 79` | `GET /products/search?limit=abc` or `page=-3` reached SQL as NaN / negative (500); a repeated `?q=` crashed `.trim()` (500). | Single string values only; page / limit whole numbers in range with defaults. | smoke: odd parameters → 200 |
| 12 | Low | `backend/src/services/stock/sellingRights.ts:98` and `partnerStock.ts` | The selling-rights / stock SQL builders put the product expression and table alias into the SQL text. Checked: every caller passes a constant (`'p.id'`, `'$1::uuid'`, `'v'`) and the kind is reduced to two fixed words — **no user input reaches them**. Hardening only. | `sqlRef()` accepts only a column, alias or `$n` / `$n::uuid` placeholder and throws otherwise; used by every builder. | `services/stock/sellingRights.test.ts` ("only fixed column / alias / parameter expressions") |
| 13 | Low | `backend/src/controllers/partyLicence.controller.ts:117` | `GET /admin/party-licences?party=` put the value into SQL text (safe: zod enum of two words). Hardening. | Bound as a parameter. | smoke: party=customer / vendor filters, anything else 422 |
| 14 | Low | `backend/src/services/partnerStockImport/import.service.ts:161, 264` | Two partner stock-import steps were not in the audit trail (column mapping confirmed, import cancelled). C-46. | Audited (`partner_stock_mapping_saved`, `partner_stock_import_cancelled`). | smoke: cancel audited |
| 15 | Low — **left** | `controllers/password.controller.ts` | A wrong current password on change-password does not count towards the account lock (only the IP limit of 20 auth requests / 15 min applies). | Left: the caller already holds a valid session for that account; the IP limit bounds guessing. Revisit if change-password is ever offered without a session. | — |
| 16 | Low — **left** | `routes/medicines.routes.ts` (`POST /:productId/info/review`) | The pharmacist who wrote a medicine-information draft may also approve it (no second pharmacist). | Left: an owner decision (C-19 asks for a pharmacist's review; Sprint 29 noted the same for product copy). One registered pharmacist on the trial. | — |
| 17 | Low — **left** | `index.ts` (search, suggest) | No search-specific limiter. | Left: the general limit (200 requests / 15 min per address) already covers the 250 ms-debounced typeahead; suggest is bounded (100 characters, 12 rows, sellable products only). | — |

## Checked, no issue found (information)

- **Authorisation on every new route.** Roles per route checked against the controllers:
  catalogue drafts (approve = pharmacist_rx only; bulk set refuses clinical fields), catalogue
  lists (edit = admins), medicine information (review = pharmacist_rx only), trust pages
  (publish = admins), selling rights, partners, partner stock files (admins), health-profile
  order view (pharmacists only; buyers and admins 403). Ownership: reminders, doses, family
  members, health profile, prescriptions (`/my`, `use-for-order`, signed link = owner or
  pharmacist_rx), cart buy-again / cheaper options, demo payments (order / consultation of the
  signed-in buyer) and partner stock imports (every query filtered by the partner's vendor id)
  — no other IDOR found beyond #1.
- **Demo payments** exist only with `APP_ENV=trial` and no Razorpay keys: `config/env.ts`
  refuses `DEMO_PAYMENTS` elsewhere and every demo call re-checks (`assertDemoPayments` → 404).
- **Trust pages / medicine information (admin- and pharmacist-edited text).** The website renders
  them as text blocks (`InfoPageBody`, `InfoSectionBody`); there is no `dangerouslySetInnerHTML`
  anywhere in `frontend-web/src`. Placeholders are filled from settings only; unknown ones refused.
- **CSRF.** Every new state-changing route needs the `Authorization: Bearer` header (access token
  held in memory). The refresh cookie is httpOnly, Secure, SameSite=Strict, scoped to
  `/api/v1/auth`, and cookie-authenticated calls need the `X-Client: web` header (CORS preflight).
- **Formula injection.** Text from partner files is shown in the portals and stored; the only CSV
  downloads go through `utils/csv.ts`, which prefixes cells starting with `= + - @` (and tab / CR).
- **Passwords.** Temporary and changed passwords follow `utils/passwordPolicy.ts` (8–72 bytes,
  letter + digit, not the mobile); bcrypt comparisons; never logged or audited (redacted keys).
- **Process guards** (`config/processGuards.ts`): unhandled rejections are logged once serving and
  fatal only before listening — no secret or body is printed.
- **SQL** in the Sprint 25–33 services is parameterised; the interpolations found are constants
  (column lists of fixed record keys in the catalogue import, enum words, the builders in #12).

## Not in scope / follow-ups

- Mobile app (another workstream): the app's KYC / licence / prescription uploads now need the
  file's real type to match the declared one — photos picked as JPEG / PNG and PDFs are unchanged;
  a HEIC photo sent as `image/jpeg` would be refused with "Only PDF, JPG and PNG".
- The catalogue template file (`templates/01_Medicine_and_Inventory.xlsx`) was not edited; the
  import reads a "Schedule C/C1" column by its heading when an admin adds it.
