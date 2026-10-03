# Quality sweep of the website — Sprint 43 (2026-10-03)

**Why.** The owner tests the trial by clicking through it as a customer and as staff. Early on he
found "multiple errors or mis-linked pages or no clarity" (search, quantity, back button,
payment). Many sprints have added flows since; this sweep looked at the whole site again, as
each role, on a phone (390 px) and a laptop.

**How.**

1. **Trial-like stack.** A separate database seeded with the trial demo (`demoSeed.ts`: 8 demo
   logins, 42 demo medicines, a demo partner and doctor), the API as the restricted login
   `dawabag_api`, `APP_ENV=trial` (demo payments, authorise-then-capture), a production build of
   the website, the in-memory fake object store. Nothing real called; nothing kept.
2. **Link crawl per role** (anonymous visitor, customer, B2B retailer, doctor, pharmacist, packer,
   rider, super-admin, partner): every link in the menus and on each page followed (two of each
   kind of detail page), ~300 pages. On each page: HTTP status, browser console errors, failed API
   calls, words a pharmacy owner would not understand (error codes, raw JSON, `[object Object]`,
   `undefined`, `null`, ids), a way back, and the page width at 390 px.
3. **Journeys in a real browser.** The customer walkthrough (search with typos, quantity, back,
   cart, prescription upload, checkout, every demo payment method, authorise-then-capture) on a
   phone and a laptop; the recorded journeys (`e2e/journeys`) for customer (OTC and prescription),
   pharmacist (prescription check and OTC check → release), packer (pack → dispatch to own rider),
   rider (doorstep handover with the delivery code), admin (overview, settings, registers,
   recall alerts), doctor onboarding and consultation, partner onboarding (approve, link login,
   commission, listing, stock → live) and the partner's order (seal, dispatch, deliver,
   settlement), returns and refunds. A journey step the screen could not do is noted by the
   recorder — none are left (see "Journeys" below).
4. The existing browser suite (`e2e/tests`) covers search, cart, checkout disclosures, the
   prescription gate, staff GDP / excursions / self-inspection / drills (`sprint40.spec.ts`),
   emergency stop, integrity and the two-step sign-in pages; it runs in full on every change.

Screenshots were taken in a scratch folder outside the repository and are not committed.

## Findings

Severity: **High** — a person cannot finish a task or is told something wrong about money or
medicines; **Medium** — confusing or misleading, or a page errors for a role that can reach it;
**Low** — noise, wording, layout.

| # | Page / role | Problem | Fix | Severity | Status |
|---|---|---|---|---|---|
| 1 | "My orders" (customer, retailer) | The list said **"Being prepared"** for an order the order page called **"Pharmacist check"** (not yet released) — two different answers to "where is my order?" | API `GET /orders/my` now returns the order's `pharmacist_check`; list and order page use one label rule (`lib/orders/statusLabel.ts`) | Medium | Fixed |
| 2 | Admin overview (pharmacist / KYC reviewer) | A pharmacist opening "Admin" was redirected, but the page first asked for two admin-only lists → two "403" errors | Nothing admin-only is asked for before the redirect | Medium | Fixed |
| 3 | Journeys (test tooling) | The recorded journeys had not run since Sprint 39: the payment button now reads "Authorise ₹… securely", the pharmacist's council registration must match, new products start "not allowed online", the partner approval no longer asks for licences already on file, and the pharmacist opened the first prescription in a shared queue instead of the journey's own | Journeys updated (`e2e/journeys/flows/*`, `lib/people.ts`) | Medium | Fixed |
| 4a | Order page → Bill summary (customer, retailer) | The lines did not add up: "Subtotal ₹40.00 · Shipping ₹49.00 · Total ₹93.80" — the GST (and any wallet use) was missing; and the raw payment id was printed | Items, GST, Delivery, Discount, Paid from wallet → Total; "Refunded since" when money came back; payment method only | Medium | Fixed |
| 4 | Every public page (visitor not signed in) | Each page load logged a "401 Unauthorized" error in the browser (the session check) — noise that hides real errors | `POST /auth/refresh` from the website without a session cookie answers 200 "signed out" (`data: null`); apps unchanged | Low | Fixed |
| 5 | Book a consultation (visitor) | The payment options were requested five times and refused (401) before sign-in | Asked only when signed in | Low | Fixed |
| 6 | Policy pages from the footer (Terms, Privacy, Shipping, Cancellation, Returns) | A policy not yet published showed a red error box | Neutral "This policy is being prepared…" with a link to licences and grievance redressal. **Owner:** publish the five policies (lawyer's text) | Low | Fixed (text pending owner) |
| 7 | Admin → Settings | Raw values shown: `{"paused":false}`, "… paise …; null = off", and the internal setting key under each name | Plain words ("Paused: No"), the plain-English hint instead of the internal note and key | Low | Fixed |
| 8 | Admin → Two-step sign-in (phone) | The page could be scrolled sideways by 19 px | A screen-reader-only label inside a scrolling table escaped it; every horizontal scroller now contains its content (`globals.css`) — same fix for the other 8 tables with such labels | Low | Fixed |
| 9 | Order page → Refunds / credit notes | Refunds named their source with internal words ("cancellation", "admin") and credit notes as "return damaged" | "order cancelled", "from Dawabag", "order changed", "return: damaged" | Low | Fixed |
| 10 | Search, product, cart, home, checkout, prescription notices (8 places) | "Our pharmacist checks it **before dispatch**" while the payment card said "**before anything is packed**" (the rule since Sprint 35) | One wording: "before packing" | Low | Fixed |
| 11 | "My orders" cards | Each order was a clickable box, not a link (no keyboard focus, cannot open in a new tab) | Real links | Low | Fixed |
| 12 | Checkout review (retail customer) | "Payment terms: prepaid" — a term a shopper does not use | Shown only for credit terms, in words ("Pay within 30 days (credit bill)") | Low | Fixed |
| 12a | Order page (phone and laptop) | Two Back arrows (the header's and the page's own) | One — the header's | Low | Fixed |
| 12b | Staff → Medicine information editor | No way back (opened from a product, the approvals list or New products) | Back control | Low | Fixed |
| 13 | Admin overview, warnings | Warnings name server settings (`TOTP_ENC_KEY`, now `HEALTH_ENC_KEY`) | Kept on purpose: they are instructions for whoever runs the server, with the RUNBOOK section | Info | Won't fix |
| 14 | Partner → Stock feed, Admin → Partner | The stock-feed address contains the partner's id | Kept: it is the machine address the partner's billing software needs | Info | Won't fix |
| 15 | Checkout, footer (trial) | Licence numbers listed twice ("DEMO … (20)" and "DEV-ONLY-…") | Only on a development database where both the demo seed and the development placeholders ran; the trial has the demo ones only | Info | Not a bug |

**Counts:** High 0 · Medium 4 · Low 11 · Info 3 — 15 fixed, 3 left on purpose.

**Checked and fine:** search (typos, short words, Enter, suggestions with quantity), quantity
steppers on cards, product page and cart, Back on every inner page (header back arrow on phones,
"← All …" links on detail pages), checkout steps (address → prescription → review → payment) with
the prescription chosen before payment and the hold explained, every demo payment method incl.
decline and retry, order tracking, cancellation, invoice download, pharmacist queue → check →
release, packing → dispatch → rider handover with the delivery code, partner listing → live →
shipment release → dispatch → delivered → settlement, admin approvals and settings, emergency
stop, integrity and chain heads, two-step sign-in pages, staff GDP / excursions /
self-inspections / drills. No page answered 404 or crashed; no console errors left for any role
except a policy that is not published yet (the API answers 404 for it, by design).

## Journeys

The full recording (`e2e/journeys`, 108 steps, phone and laptop) now runs end to end **on the
screen**: no step had to be done through the API. Before this sprint it stopped at the first
prescription payment (see finding 3). Roles covered: customer (OTC and prescription, delivery code,
delivered, forgot password), pharmacist (prescription check, OTC check and release), packer (pack,
dispatch to own rider), rider (run sheet, doorstep handover), admin (overview, menu filter, recall
alerts, settings, registers), doctor (onboarding, registration check, slots, consultation,
e-prescription, check by code), partner (approval, login, commission, listing, stock, live, the
partner's own pharmacist check, seal and dispatch, delivered, settlement), returns and refunds.
The customer walkthrough on the demo trial (37 steps per device, every demo payment method) ran
without a failed step.

## After the fixes — second crawl

The same crawl after the fixes (316 pages over the nine roles): the only pages still flagged are
the five unpublished policies (the API answers 404 for them; the page now says "being
prepared"), the admin overview's server warnings (finding 13) and the partner's stock-feed
address (finding 14). No failed API call, no console error, no raw value and no page wider than
a 390 px phone anywhere else.

## Also built this sprint

- **Changing an order before packing** (URS-074): "Change order" on the order page — see
  DECISIONS 2026-10-03 and RUNBOOK §6.
- **Health details encrypted at rest** (URS-006) — see DECISIONS 2026-10-03 and RUNBOOK §6
  "Health data key".
