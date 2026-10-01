# Active Context

## Current state (2026-10-01)
The February Kilo Next.js prototype was replaced by the Dawabag v2 package
(built in a Claude chat, 30 Mar 2026). Sprints 1–20 are done (Sprint 14 video calls wired on web and mobile) on branch
`claude/dawabag-pharmacy-status-0h7mr3`; beta now waits mainly on owner data, keys and
the lawyer/CA sign-off.

## Standing rules from the owner (2026-09-30)
- Server is the single source of truth: no local storage anywhere (see DECISIONS.md).
- Modular software: no monolithic HTML/single-file apps.

## Sprint 20 — owner choices and rehearsal R2 (2026-10-01)
- Owner chose **Direction A (clinical trust)** and **rehearsal R2 (recorded journeys)**
  from the design review (artifact "Dawabag Design Review").
- `scripts/record-journeys.sh [out]` + `e2e/journeys/`: records customer (OTC and
  Schedule H), pharmacist, packer, rider and admin journeys as captioned screenshots
  (phone + laptop) through the real screens; Razorpay Checkout is stubbed onto the
  fake gateway and prescription uploads use `backend/test/fakes/s3.mjs` (in-memory,
  opt-in via S3_ENDPOINT — not in dev-env, sprint1 smoke expects 503 without S3).
  Output (steps.json + shots) goes outside the repo. Published as "Dawabag Rehearsal R2".
- Found by the rehearsal and fixed: pack/dispatch queue flagged OTC lines as awaiting
  a prescription (`rx_cleared` now = prescription attached, or not Schedule H/H1, or a
  KYC-approved trade buyer — same rule as payment capture); order confirmation now
  shows total paid incl. delivery; phone search placeholder shortened.
- e2e clean-up (`support/data.ts`) deletes by following foreign keys, so fully
  fulfilled test orders are removed.
- Gotchas: dev-env exports PORT=4000 (the API's) — start the website with PORT=3000;
  stale `next-server` processes answer on :3000 with an old build; `pkill -f` patterns
  must not match the calling shell's own command line.
- Not yet recorded: doctor consultation, partner pharmacy, returns/refunds.

## Direction A — clinical trust redesign (mobile, 2026-10-01)
- Theme: brand green aligned with the web (#167A4C / #105C38); Material 3 NavigationBar.
- Customer shell tabs: Home, Search (`/search`, new), Orders, Account. Cart is now a
  full-screen route opened from the app-bar cart icon (`widgets/cart_action_button.dart`).
- Home (`screens/shop/home_screen.dart` + `widgets/home/*`): search entry (opens Search),
  trust strip, prescription CTA (sheet explaining the existing checkout prescription step,
  C-08 — no standalone upload endpoint exists), "Consult a doctor" (/doctors), server
  category tiles (filter), product grid, compact expandable "Licences, pharmacist &
  grievance officer" tile (`widgets/legal/legal_summary_tile.dart`, C-04/C-36).
- `providers/catalog_provider.dart` holds product search/categories; pincode is memory-only.
- `widgets/product_image.dart` (network image only if the API sends a full URL — today it
  sends only `s3_image_key`, so placeholders show) + `utils/dosage_form.dart`.
- Product page shows C-17 declarations, hiding empty rows; description only when approved.
- `widgets/empty_state.dart` used by cart, orders, search. Cart names the delivery charge as
  "shown at checkout" (cart API has no delivery figure; no consumer free-delivery threshold).

## Direction A — clinical trust redesign (web, 2026-10-01)
- Home (`app/page.tsx` + `components/home/*`): HomeHero search ("Search medicines, e.g.
  Dolo 650", `?focus=search`), TrustStrip (licence badge → /legal), PrescriptionCta (links
  /cart — upload happens at checkout, C-08), Consult a doctor, CategoryTiles (replaced
  CategoryChips), ProductResults (skeletons + EmptyState).
- `components/shop/ProductImage.tsx` + `lib/shop/dosageForm.ts` replace the 💊 emoji
  (API exposes only `s3_image_key`, so the initial + dosage-form tile shows).
- Product page: empty declaration rows hidden; "awaiting pharmacist review" only for staff.
- `components/layout/BottomNav.tsx` (phones; not in portals/checkout or for staff roles);
  `lib/layout/portalPaths.ts`. Footer hidden in /admin /staff /partner /doctor; phones get a
  one-line licence summary + `<details>` with LegalBlocks (C-04/C-36). Toaster top-center
  below the header.
- Cart: `DeliveryChargeLine` shows the server's pincode shipping charge for the default
  address (from /products/search pincode_info), else "Shown at checkout"; none for B2B.
- Admin menu: seven sections in `lib/admin/navSections.ts`, collapsible, with a filter.
- `components/ui/EmptyState.tsx` used by cart, orders, home results.

## Sprint 20 — IST everywhere (web, mobile)
- Owner rule: every date/time shown or computed is India Standard Time (Asia/Kolkata,
  UTC+05:30, no DST), whatever the viewer's device/browser zone.
- Web: one module `frontend-web/src/lib/dates.ts` (IST_TZ, formatDateIST '01 Oct 2026',
  formatDateTimeIST '01 Oct 2026, 2:05 pm', formatTimeIST, formatClockTime, `{ zone: true }`
  appends " IST", todayIST, daysAgoIST, lastMonthIST, isOnOrAfterTodayIST, nowISTInput,
  istInputToIso / isoToISTInput for datetime-local). Old copies (utils.formatDate,
  admin/format, fulfilment/roles, recallAlerts/time, incidents local-time inputs,
  telemedicine formatSlotDate/Time) removed; all imports point at lib/dates.
  'YYYY-MM-DD' values are never zone-shifted. Staff deadlines, slot times and
  datetime-local labels say IST.
- Mobile: one helper `mobile/lib/utils/ist.dart` (toIst = UTC+5:30, never .toLocal();
  formatDateIst, formatDateTimeIst, formatTimeIst, formatClockTime, istCalendarDay,
  todayIst/todayIstDate, isOnOrAfterTodayIst); formatters.dart keeps only money;
  consult_format.dart delegates. Slot times show "IST". Tests: mobile/test/ist_test.dart.

## Done in Sprint 20 (critical journeys in the browser)
- e2e: checkout to the payment step with C-35 disclosures (seller + licence, country of origin,
  delivery charge, refund/return policy links); Schedule H order blocked at the prescription step
  until a prescription is given; footer licence/grievance details; pharmacist lands on the queue.
  29 browser tests pass locally. CI fixes: website built with NODE_ENV=production in the browser
  job; file_picker 10 (6.x used the removed Flutter v1 plugin API and broke the APK build).

## Done in Sprints 18–19 (staging, browser tests, accessibility)
- deploy/staging: compose stack behind Caddy (auto HTTPS), staging.env git-ignored, check.sh; CI job
  "staging" starts it with Caddy's own CA and runs the checks (green on first run).
- e2e/ (Playwright 1.56 + axe): 25 browser tests (desktop + phone) — search, product declarations,
  httpOnly session cookie, server-held cart seen from a fresh browser, admin access/denial, no
  localStorage/sessionStorage, WCAG 2.1 AA on public pages. CI job "browser".
- Accessibility fixes: brand-600 #167A4C / 700 #105C38, gray-400 → #6B7280, text-green-600 → 700,
  aria-labels on cart/account/sign-out icons and the password toggle.
- Android: plugins compiled against SDK 36 (agora was on 31); app id com.dawabag.app.
- dev-up.sh starts the API with setsid/disown (no longer hangs a piped shell).

## Done in Sprint 17 (installable mobile app)
- Flutter 3.47.5 installed locally at /opt/flutter-sdk (not in the repo); android/ and ios/ generated
  (app id com.dawabag.app — `in.` is a Java keyword so in.dawabag.* is impossible; owner to confirm before the first store upload).
  Permissions: camera, mic, notifications, network; iOS usage texts; allowBackup=false; minSdk 24;
  desugaring for flutter_local_notifications.
- Firebase optional: options from --dart-define (lib/config/firebase_config.dart); app starts without.
- Unused plugins removed (maps, local_auth, camera, share_plus, lottie, shimmer, connectivity,
  package_info, crypto, codegen). pubspec.lock committed.
- CI builds a debug APK artifact (dawabag-debug-apk; API from repo variable MOBILE_API_URL).

## Done in Sprint 16 (dependencies, mobile build, images, indexes)
- npm audit 0 on backend and web: Next.js 15.5.27 + React 19 (14.x unpatched: RCE/SSRF/DoS), PostCSS
  override, nodemailer replaced by the SES API, uuid 11 override. CI fails on high/critical advisories.
- Mobile analysed and unit-tested in CI for the first time (Flutter stable): 1 error fixed, warnings
  fixed; cached_network_image dropped (its on-device SQLite cache broke the no-local-storage rule).
  Remaining infos: DropdownButtonFormField `value` deprecation kept on purpose (initialValue would stop
  following state); prefer_const style notes.
- CI builds both Docker images; the API image migrates an empty DB and answers /ready, the web image
  serves the home page.
- Migration 18: indexes for hot child lookups and recall batch keys.

## Done in Sprint 15 (engineering readiness)
- `scripts/dev-env.sh` + `scripts/dev-up.sh`: one command from a fresh machine (or this container after a
  restart) to a migrated API on the fake providers; Redis without snapshots.
- GitHub Actions CI on every push/PR: backend tsc, jest, migrations ×2 on empty Postgres 16, all smoke
  suites; web tsc, lint, build. First runs green.
- X-Request-Id on every request (access/error logs `rid=`, error replies `request_id`); admins alerted once
  when a scheduled job starts failing (`job_failed`).
- Mobile: doctors list a day's consultations, join the call and end it (prescribing stays on the web).
- Tests: Sprint 1–15 smoke 700 checks, jest 67.

## Done in Sprint 14 (backend)
- Regulator recall alerts (C-28): CDSCO NSQ / FDA / manufacturer lists uploaded (.xlsx/.csv in memory) or
  typed in; batches matched on letters+digits against own and partner stock held or sold; each match
  recalled or cleared with a note; 4-hour deadline, admin alerts at entry and when overdue
  (job recall_alert_watch); receipts, partner listings and opening stock refused for a batch on an alert
  until cleared for that product, and for a recalled batch always. Migration 17 (final records).
- Security review of Sprints 12–13: 10 findings (5 medium) fixed with tests — riders: no order list or
  invoices; consultation refunds settle only when processed (webhook + sweep retry); WhatsApp allow-list
  (no health values); settlements respect the GST lock; courier-booking race; dispatch message after
  commit; call tokens ≤ 30 min; cart purge progress; recall notices kept; consent notice language;
  TRUST_PROXY_HOPS required in production.
- Tests: Sprint 1–14 smoke 696 checks pass, jest 64. Note: the container restarted mid-sprint and the
  local Postgres was recreated empty; all migrations 01–17 and suites ran green on it.

## Done in Sprint 13 (backend)
- Own riders: dispatch to a rider (rider_id) or a courier (response carries the DWR AWB), reassign (packers see the deliver queue for it), rider run sheet
  (GET /fulfilment/my-run), delivered/invoice limited to the rider's own parcels, delivery
  role 404 on orders — closes the Sprint 12 review item on delivery-staff scope (C-26, C-41).
- Agora call tokens on join (uid, token, token_expires_in) — closes the video-token item (C-23).
- GST period lock `accounts.locked_until` for GRNs and supplier credit notes (C-31).
- WhatsApp through MSG91 templates after opt-in consent (`whatsapp` purpose).
- Tests: Sprint 1–13 smoke 653 checks pass, jest 60, fresh-DB migrations 01–16 apply.

## Web Sprint 14 — video calls (tsc + next lint + next build pass)
- `agora-rtc-sdk-ng` ^4.24.8, imported only inside the call hook's effect; CallRoom loaded
  with next/dynamic ssr:false. lib/telemedicine/useAgoraCall.ts (join with the string user
  account uid, publish mic/camera, subscribe, mute = setMuted, camera off = setEnabled,
  token-privilege-will-expire → GET /consultations/:id/join again → renewToken, remote
  left, always close tracks + leave on unmount) and callStatus.ts (status/error wording).
- components/telemedicine/call/: CallRoom (full-screen), CallStage, VideoTile,
  CallControls, CallStatusLine. JoinDialog shows "Start video/audio call" when mode is
  video/audio and the server sent a token; token null keeps the "not set up" note; chat
  keeps the old text. useJoin keeps { id, info }. Patient + doctor both. Audio mode = mic
  only. C-23: patient and doctor only, nothing recorded; nothing stored in the browser.

## Web Sprint 14 — recall alerts (tsc + next lint + next build pass)
- /admin/recall-alerts (admin/super_admin; layout RequireAuth MANAGER_ROLES; nav "Recall
  alerts" under Batch recalls): Open / All tabs, rows with source label, reference,
  received + deadline (IST) and a live "Xh YYm left" / red "Overdue" badge computed from
  due_at vs the clock (useNow, nothing stored), lines/matches/to decide/recalled/cleared.
- "Upload list" (multipart .xlsx/.csv ≤ 5 MB; columns Drug name, Batch No., Manufacturer,
  Reason) and "Type in alert" (editable rows) dialogs share AlertHeaderFields: source,
  reference, received at as datetime-local read as India time → ISO with +05:30, not in the
  future. Success → detail page; 422/400 show the server message.
- /admin/recall-alerts/[id]: summary card + lines (matched first). Matches show our product,
  maker, batch spellings, held/sold, decision; pending → Recall (confirm dialog naming
  product, batches, units, buyers told to stop using it) or "Not this product" (note ≥ 5);
  decided → who/when/notes + "View recall" (/admin/recalls/:id); 409 re-reads the alert.
  Every line has "Clear a product refused at receipt" (recalls ProductPicker + note);
  unmatched lines read "Not held".
- GRN form: 409 "recall alert RA-…" shows RecallAlertBanner (link for admins).
- Files: lib/recallAlerts/{api,types,labels,time}.ts, components/admin/recallAlerts/*.

## Mobile Sprint 15 — doctor join (not compiled — no Flutter SDK here)
- /doctor/portal is now a small hub → /doctor/consultations (DoctorConsultationsScreen:
  day list from GET /consultations/doctor?date=YYYY-MM-DD, IST today by default, DayBar
  prev/next + date picker). Card: slot time, patient name/gender/age, mode, status, payment.
- "Join" on open rows calls GET /consultations/:id/join (server 402/409 text in a snackbar),
  then pushes /consultations/:id/call with the ConsultJoin as GoRouter `extra`
  (VideoCallScreen.initialJoin; patients still use consultJoinProvider). Call screen closes
  to /doctor/consultations for role 'doctor'. "End consultation" (in_progress only) →
  POST /consultations/:id/end { notes? }. Prescribing stays web-only (note on rows).
- Files: models/doctor_consultation.dart, services/doctor_consultation_api.dart,
  providers/doctor_consultation_provider.dart, screens/doctor/portal/ (+ widgets/).

## Mobile Sprint 14 — video calls (not compiled — no Flutter SDK here)
- services/video_call_service.dart (ChangeNotifier over agora_rtc_engine 6.x: permissions
  via permission_handler, initialize, enableVideo/startPreview, joinChannelWithUserAccount,
  onTokenPrivilegeWillExpire → refetch join → renewToken, leave/release on dispose).
- screens/consultations/call/video_call_screen.dart + widgets (local_preview, remote_view,
  call_controls, call_status_banner); route /consultations/:id/call reuses
  consultJoinProvider. Join screen "Start video/audio call" when a token was issued.
- No android/ios folders in the repo: add CAMERA/RECORD_AUDIO/INTERNET (Android) and
  NSCameraUsageDescription/NSMicrophoneUsageDescription (iOS) when they are generated.

## Web Sprint 13 (tsc + next lint + next build pass)
- Dispatch dialog: "Our rider" (RiderSelect from GET /fulfilment/riders) or courier — never
  both; courier-booked packs stay courier-only. After a rider dispatch the DWR… run reference
  is read back from GET /orders/:id (dispatch response has no AWB) and shown (RunRefNotice).
  Deliver tab: "Reassign rider" on parcels whose courier is "Dawabag rider" (admin/super_admin
  only — packers cannot see the deliver queue; the endpoint itself also allows packers).
- Delivery role: /staff/run-sheet (RunSheet + RunStopCard: address, contact, seal, run ref,
  code needed, line count, invoice; no medicines, no order links) with HandoverDialog (no
  override). Fulfilment tabs render the run sheet for riders; nav "Run sheet"; login/header
  route riders there; header "Orders" hidden for delivery.
- Join dialog: "Secure call link valid for N minutes" from token_expires_in; token null →
  "video service not set up" (no web video SDK wired yet). lib/telemedicine/callToken.ts.
- Privacy: ConsentToggleRow for marketing + WhatsApp ("Send order and refill updates on
  WhatsApp", can be turned off any time) → PUT /privacy/consents/whatsapp (C-42).
- Settings: AccountsLockSection ("GST period locked up to", date ≤ UTC yesterday or clear,
  confirm step) and WhatsAppTemplatesSection/Editor (type → name [a-z0-9_], language
  xx/xx_XX, ordered vars ≤ 10; mirrors server zod; 422 list shown). GRN form and supplier
  credit-note dialog show a LockedPeriodBanner on "closed GST period" 409s.

## Mobile Sprint 13 (not compiled — no Flutter SDK here)
- ConsultJoin gains uid/token/tokenExpiresIn; join screen shows CallLinkNotice (valid N
  minutes, or video service not set up when token is null). agora_rtc_engine is in
  pubspec but no call client is wired, so the token is not passed anywhere yet.
- Privacy: WhatsApp SwitchListTile ("Send order and refill updates on WhatsApp") →
  PUT /privacy/consents/whatsapp via PrivacyNotifier.setWhatsApp.
- Rider run sheet skipped: the app has no staff/delivery section (customer + doctor only).

## Web Sprint 12 (tsc + next lint + next build pass)
- Policies in en/mr/hi (C-40): /policies/:key switcher (?lang=, "Not yet available in …;
  showing English"), index links translations; /admin/policies "Publish translation"
  (PolicyTranslationForm) + history grouped per version with languages. Registration sends
  notice_language (notice link opens in that language); privacy screen shows "Privacy notice
  v3, Marathi". Settings: RetentionSection (retention.days) + catalogue.opening_stock_open
  switch. Doctor approve sends nmc_reg_number (409 → refresh), reject shows refunds count.
  Telemedicine lists pharmacist_rx only. Receive-without-PO admin only; free ≤ paid qty;
  PO approve / return hand-over / destruction hidden for the raiser. Blind counts (no
  system_qty), count-approve 409 banner. Consult 'refund_pending' = "Refund in progress";
  cancel refund {pending} = "Refund of ₹X initiated".

## Mobile Sprint 12 (not compiled — no Flutter SDK here)
- PolicyScreen gets an English/मराठी/हिंदी bar (policyInLanguageProvider, ?lang= route
  param, English-fallback note). Register: "Read the privacy notice in" dropdown, opens
  /policies/privacy?lang= in-app, sends notice_language. Privacy screen shows notice version
  + language. Device registration 409 logged and ignored. Consult refund_pending label and
  pending-refund snack.

## Web Sprint 11 (tsc + next lint + next build pass)
- /admin/refunds: "Retry with Razorpay" on pending gateway refunds with a failure_reason
  (POST /returns/refunds/admin/:id/retry; 409 texts shown), attempts count; UTR path kept.
  /admin/accounts: 'payment-reconciliation' report (≤31 days hint, server 400 shown,
  status colour-coded). Doctor: /doctor/slots lists own slots (GET /doctors/me/slots,
  booked/blocked shown, Block only free); prescribe page loads GET /consultations/:id
  (no ?date=); medicine search always shows the TPG list.

## Web Sprint 10 — teleconsultation (tsc + next lint + next build pass)
- Patient: /consult (verified doctors with qualification, council, reg. no./year, fee),
  /consult/[doctorId] (date + open slots, mode, chief complaint, TPG consent checkbox →
  book → Razorpay checkout.js, same script as order payment; no patients picker exists on
  web so no family member yet), /account/consultations (pay / join / cancel with refund
  toast / view Rx), /account/consultations/prescriptions/[id] (details, PDF via
  downloadFromApi, public check link, optional "Order these at Dawabag" → /use with "You may
  buy these medicines from any pharmacy", C-24). Join shows channel/mode/app_id; no Agora SDK yet.
- Public /eprescriptions/verify and /verify/[code]: valid/expired banner, doctor + registration,
  patient initials/age/gender, medicines.
- Doctor portal (role doctor; DoctorShell/DoctorNav, Header link now /doctor): /doctor (day list,
  join/end with notes/cancel, write/view Rx), /doctor/profile (registration form + status /
  rejection reason), /doctor/slots (date range × daily window × slot length × weekdays, ≤200
  per request; free slots with Block), /doctor/consultations/[id]/prescribe?date= (diagnosis,
  advice, new-condition toggle on follow-ups, 1–20 medicine rows via /products/search, server
  422 refusals one per line), /doctor/prescriptions/[id].
- Admin /admin/doctors (enable by mobile, status tabs, verify/reject with notes 3–1000) and
  /staff/telemedicine-lists (pharmacist_rx/admin: set List O/A/B/prohibited + notes; Schedule X /
  NDPS forced prohibited); both in AdminNav. Admin product table shows the tele list.
- Staff Rx viewer: /prescriptions/:id/url {digital, pdf_path} → DigitalRxViewer shows the PDF
  in memory (blob URL) via the authenticated client + download.
- lib/telemedicine/{types,api,doctorApi,adminApi,labels,slots,profileForm,prescriptionForm,
  razorpay,roles}.ts; components/telemedicine/{common,patient,doctor,admin,public}/*,
  components/staff/telemedicine/*; getApiErrorLines() in lib/apiErrors.ts; fetchApiBlob() in
  lib/download.ts. Public product search does not return telemedicine_list, so the prescribe
  form shows it only when present.

## Web Sprint 9 — e-invoices and purchase returns (tsc + next lint + next build pass)
- /admin/einvoices (admin, super_admin; AdminNav): "e-invoicing is off" banner (C-31),
  pending/failed/generated tiles, status tabs, table (IRN shortened, full in title, ack,
  IRP error), Retry on failed/pending rows. lib/einvoices/{api,types}.ts,
  components/admin/einvoices/*.
- Settings: einvoice.enabled as an on/off switch with a confirmation dialog (new
  'boolean' setting kind, components/admin/settings/SettingSwitch.tsx; super_admin edits).
- Dispatch dialog shows server refusals (409 IRN pending/failed) in a clear red box; pack
  toast notes "registering the e-invoice (IRN)" when einvoice_required.
- /staff/purchase-returns list, /new (supplier → its batches or "Recalled stock", free =
  available − reserved, cost value, server 422 lines one per line) and /[id] (approve /
  reject hidden for the requester, dispatch reference, supplier credit note with
  short/over difference). lib/purchaseReturns/{api,types,labels,form}.ts,
  components/staff/purchaseReturns/*. Nav entry for STORE_ROLES.
- Accounts: 'purchase-returns' report label. /staff/stock: "Recalled only" filter and
  paging from the server's total (fetchBatches now returns {batches,total}).

## Done in Sprint 11 (payments end to end)
- Migration 14. services/payments/{capture,checkout,webhook,reconcile}: one idempotent capture path
  (verify, webhook, sweep) for mandates, consultation fees, orders and refill charges; webhooks
  signed + de-duplicated (payment_webhook_events); refund.processed/failed, token.*; refund retry;
  job payment_reconcile; report payment-reconciliation (live Razorpay settlements, ≤ 31 days).
- Fixed: attaching a refill to a mandate always failed (untyped SQL parameter).
- Tests: test/sprint11.smoke.mjs (35); sprints 3 and 5 now run against the fake Razorpay;
  sprints 1–11 = 583 checks; jest 58.

## Done in Sprint 10 (teleconsultation, TPG 2020)
- Migration 13. Doctors verified against the council register; TPG medicine lists (O/A/B/
  prohibited) set by pharmacists; consult modes, consent, first/follow-up; Razorpay fee and
  refunds; e-prescriptions final, PDF on demand, public check code, sent to the pharmacist
  unverified when the patient chooses Dawabag. Legacy monolithic route files replaced.
- Tests: test/sprint10.smoke.mjs (65).

## Done in Sprint 9 (e-invoicing, document numbers, purchase returns)
- Migration 12. Document numbers now fit CGST Rule 46's 16 characters: `DWB/2627/00012`,
  credit notes `DWBC/2627/00001`, PO/GRN/PRN likewise; counters continue (gap-free); the
  function raises above 16; partner prefixes 2–4 chars.
- E-invoicing (C-31) against the common IRP API: B2B Dawabag invoices registered at packing,
  dispatch blocked until the IRN is back, credit notes registered against their invoice, IRN +
  signed QR on the PDF, queue + sweep, Admin → E-invoices (retry). Off until einvoice.enabled.
  The unused v2 per-order e_invoices code/table was retired.
- Purchase returns (C-28): raise → second-person approval (stock out as return_to_supplier
  adjustments) → dispatch reference → supplier credit note; report `purchase-returns`.
- Tests: test/sprint9.smoke.mjs (52 checks) against test/fakes (shared fake providers incl. an
  IRP with the real encryption); sprints 1–9 pass; jest 50.

## Done in Sprint 8 (delivery and communications)
- Migration 11: user_devices (several phones per user), notification_deliveries (every
  SMS/email/push attempt: sent / failed / skipped + reason), shipment courier columns,
  shipment_tracking_events; settings courier.provider, courier.pickup_location, sms.dlt_templates.
- Notifications split into notifications/{templates,dispatcher,channels/{sms,email,push}}.
  SMS only through MSG91 DLT templates mapped in sms.dlt_templates (free text never sent);
  push through FCM HTTP v1 (service-account JWT, token cached in memory, unregistered
  tokens deleted). Admin → GET /admin/notification-deliveries.
- Shiprocket: POST /fulfilment/shipments/:id/book-courier (packed, no AWB; courier sees
  "Pharmacy items" only, C-41); dispatch can reuse the booked courier/AWB; webhook
  POST /courier/shiprocket/webhook (x-api-key = SHIPROCKET_WEBHOOK_TOKEN, idempotent,
  zone-less times read as IST): out_for_delivery notifies the buyer, delivered closes
  non-Rx parcels (Rx parcels need the code, admins alerted, C-26), RTO alerts admins once.
  Buyer order detail returns tracking_status, rto_at, tracking[].
- Admin settings accept the Sprint 7/8 keys (were missing). Receipts list filters + paging;
  destruction register CSV. Production refuses the test-only *_BASE_URL overrides.
- Web Sprint 8 (tsc, lint, next build pass): /admin/notifications (7-day per-channel
  summary, status/channel filters, failed rows show the reason); settings: courier.provider,
  courier.pickup_location, purchasing.min_shelf_life_days, stock.near_expiry_days editors
  and a table editor for sms.dlt_templates (lib/admin/dltTemplates.ts); dispatch queue
  "Book courier (Shiprocket)" and optional courier/AWB once booked; buyer order shows a
  courier tracking timeline + RTO notice; /staff/receive filters (supplier, GRN/invoice
  search, dates) with paging; destruction register "Download CSV" via downloadFromApi.
- Tests: test/sprint8.smoke.mjs (51 checks) against one fake provider server
  (test/sprint8/fakes.mjs; env from fake-env.mjs); sprints 1–8 = 428 checks; jest 47.

## Done in Sprint 4 (beta readiness)
- Migration 07. Pharmacist prescription gate with quantities and reuse (C-08), H1 register
  + CSV export (C-09), Dawabag pack/dispatch/deliver with stock deduction, invoice PDF per
  shipment (C-13), MRP/NPPA price checks (C-16), grievances with 48 h / 30 day deadlines
  (C-36), legal footer data (C-04), batch recall (C-28), prescription-view audit (C-41),
  privacy consents/export/erasure (C-40, C-44), listing rejection codes REJ-01..14.
- Tests: test/sprint4.smoke.mjs (63 checks) + Sprint 1–3 suites + 21 jest tests pass.
- Web and mobile Sprint 4 screens: see the latest commits.
- Web Sprint 4 (tsc + next build pass): /staff/fulfilment tabs (Rx verify, Pack, Dispatch,
  Deliver, H1 register + CSV) shown per role; /account/complaints (list/new/thread);
  /account/privacy (consents, marketing toggle, history, export, correction/erasure);
  /admin/grievances (status + overdue filter, reply, status/resolution); /admin/recalls
  (list, create with product search, affected orders); /admin/privacy (request queue);
  invoice PDF download per shipment on buyer order detail, partner shipments and staff
  queue (fetched via Bearer client, lib/download.ts — nothing kept locally).
- Web gaps needing backend: buyer cannot list own data requests (no GET /privacy/requests);
  GET /grievances/:id has no buyer_name; delivery role not allowed to fetch invoices;
  recall detail has no recalled_by_name; eslint is not configured in frontend-web.
- Mobile Sprint 4 (not compiled): complaints list/new/thread (/account/complaints),
  privacy consents + erasure/correction requests (/account/privacy; export is web-only),
  public About & legal (/legal), order timeline handles every status, invoice number +
  "PDF on website" note (endpoint is Bearer-only, no file writes), checkout split.
- Owner to fill in: legal.* settings (entity, licences, pharmacist-in-charge, grievance
  officer); appoint the pharmacist-in-charge and grievance officer.

## Web Sprint 7 — purchasing and stock control (tsc + next lint + next build pass)
- lib/purchasing (types, api, roles STORE/PURCHASE_ADMIN, productSearch, receiptForm) and
  lib/stock (types, api, labels); formatPaise added to lib/admin/format.ts.
- /admin/suppliers (list, add, approve via the existing ApproveVendorDialog, C-02);
  /admin/purchase-orders (+ /new, + /[id] with approve, cancel, close short, receive link);
  /staff/receive (open POs + receipts by date) /new?po= (lines prefilled with the remaining
  qty, split a PO line into batches, server 422 problems listed one per line) /[id];
  /staff/stock (batches, expiry tabs, adjust request); /admin/stock-adjustments (approval
  queue, 403 → two-person message, C-46); /staff/destruction-register (record disposal,
  C-28/C-34); /staff/stock-counts (+ /[id] blind count sheet: system qty hidden until
  submitted; approve by a different admin). AdminNav links by role; nav active match is now
  per path segment. purchase-register / stock-valuation labels added to Accounts reports.
- Backend gaps: adjustments list has no requested_by id (cannot hide Approve on own
  requests); counts list has no counter / approver names; GET /products/admin/list is
  admin-only, so pharmacists receiving without a PO search active products only;
  receipts list has no supplier/PO filter or pagination; batches list returns no total.

## Done in Sprint 7 (purchasing and stock control)
- Migration 10; suppliers, purchase orders, goods receipts (purchase register), two-person
  stock adjustments, destruction register, stock counts (blind on web), expiry_watch job,
  stock valuation; AWS SDK v3; legacy inventory routes retired; both Docker images build
  (NODE_IMAGE from ECR Public) and run.
- Tests: test/sprint7.smoke.mjs (40 checks); all seven suites pass, also on a migrations-only DB.
- Open: receipts list has no supplier/PO filter or paging; no destruction-register CSV.

## Done in Sprint 6 (beta launch readiness)
- Security review of money/access paths: 12 findings fixed (status route admin-cancel only,
  refund cap, payment webhooks, credit settlement, address/patient ownership, duplicate lines,
  coupons, wallet cap, partner handover/suspension, consultation ownership).
- Deployability: stdout logs, config checks, /ready, graceful shutdown, migration runner
  (`npm run db:migrate`, `--baseline 08` for pre-runner DBs), Dockerfiles, compose, docs/RUNBOOK.md.
  All suites pass on a DB built only by migrations; API image migrates an empty DB and runs.
- Migration 09: coupon redemptions, final-record triggers (C-34), saved-Rx request,
  cold-chain dispatch fields, security incidents.
- Catalogue/opening-stock import from the xlsx template (in memory); admin product list/detail
  (`/products/admin/list`, `/products/:id/admin`); accountant reports (`/accounts/reports/*`);
  saved Rx reuse (C-08); cold-chain dispatch record (C-25); incident register (C-43).
- Tests: test/sprint6.smoke.mjs (64 checks) + Sprint 1–5 + 35 jest tests pass.

## Done in Sprint 5 (after-sale care and consumer protection)
- Migration 08. Cancellation, returns, refund ledger, GST credit notes, partner settlement
  deductions (C-37); checkout preview (C-35); versioned policies (C-39); product declarations
  and pharmacist copy review, trade prices no longer public (C-17, C-19); sealed dispatch and
  delivery code (C-26); side-effect reports (C-29); licence register + alert job (C-07);
  doctor declaration (C-15); addresses; signed PDF links; `GET /returns/windows`.
- Defaults to confirm with the owner: DECISIONS.md "Sprint 5 defaults".
- Tests: test/sprint5.smoke.mjs (83 checks) + Sprint 1–4 suites + 25 jest tests pass.

## Mobile Sprint 5 (buyer screens, not compiled — no Flutter SDK here)
- Checkout: address → review (POST /orders/preview: per-seller block with licence and
  delivery estimate, lines with country of origin, charge break-up, returns note, policy
  links; C-35) → place order → prescription → payment. Doctors tick an unticked
  practitioner declaration, sent as practitioner_declaration (C-15); also added to register.
- Order detail: delivery code card (C-26), seal / received-by per shipment, invoice and
  credit-note PDFs via signed links opened in the external viewer (no local file), cancel
  (can_cancel), refunds / credit notes / returns card, "Report a problem" per delivered
  shipment and "Report a side effect" per line.
- New screens: /account/returns (+ /new, /:id), /account/side-effects (+ /new),
  /account/addresses (+ /new, /:id/edit), public /policies/:key; policies listed on About &
  legal; privacy screen lists GET /privacy/requests.

## Web Sprint 5 (tsc + next lint + next build pass)
- Checkout: address → review (POST /orders/preview, C-35: seller + licence + estimate,
  lines with origin/expiry, charge break-up, returns note, policy links) → place → Rx →
  pay. doc_hospital ticks an unticked own-patients declaration (C-15), also on register.
- Order detail split into components/orders/*: shipments with seal, delivery code (C-26),
  receiver; cancel (can_cancel); returns/refunds/credit-note PDFs (C-37); "Report a
  problem / return" per delivered shipment; "Report a side effect" per line (C-29).
- New buyer pages: /account/addresses, /account/returns (+[id], refunds list),
  /account/side-effects (+new, [id]), /shop/[productId] with declarations (C-17/C-19),
  public /policies and /policies/[key] (C-39, text only, no HTML); privacy page lists
  own requests; footer policy links.
- Staff/admin: seal number on staff + partner dispatch; handover dialog (code, receiver,
  admin override) for staff/partner delivery and /admin/deliveries; /admin/returns and
  /staff/returns (+[id]) decide/close; /admin/refunds (mark paid with UTR, failure
  reason); /admin/policies (new version + history); /admin/licences (C-07);
  /staff/content-review (C-19); /staff/adverse-events (C-29); partner /partner/returns and
  settlement return adjustments.
- Backend gaps seen from web: fulfilment and partner shipment queues do not return
  handover_code_required / seal_number; return detail credit_notes have no id (PDF only
  from order page); no admin product create/edit screen exists yet on web.

## Web Sprint 6 (tsc + next lint + next build pass)
- /admin/products (search list), /new and /[id] edit (rupees in, paise out; only changed
  fields PATCHed; C-16 price checks mirrored, C-17 declarations, C-19 copy review note).
- /admin/catalogue-import: template download, preview (per-row errors/warnings), commit with
  "skip rows with errors"; the File stays in memory only.
- /admin/accounts: report + period (default last month), table (₹ for *_paise), CSV download.
- /admin/incidents (C-43): live 6-hour CERT-In countdown/overdue badge, log incident, record
  CERT-In / DPB / users notified, actions, status.
- Cold-chain dispatch (C-25): temperature 2–8 °C + logger ID on staff and partner dialogs.
- Checkout Rx step offers saved verified prescriptions (POST /prescriptions/:id/use-for-order);
  staff Rx queue shows "Buyer offered saved prescription" with View / Apply.
- No web UI used PATCH /orders/:id/status (admin-only cancel), so nothing to remove.

## Done in Sprint 3 (backend)
- Owner decisions: allocation rule (> ₹10k + Dawabag ≤24 h → own stock first, else
  nearest seller), partners sell at catalogue price, refills with reminders +
  auto-order + mandate auto-charge.
- Migration 06; allocation + per-seller shipments/invoices; gap-free invoice numbering;
  partner portal API; listing review with Schedule H1 gate; settlements with commission,
  fee, GST on fees, TCS, TDS; refills API + jobs; payment webhook and verify hardening.
- Tests: test/sprint3.smoke.mjs (48 checks) + Sprint 1/2 suites + 21 jest tests pass.
- Not exercised: Razorpay mandate/recurring calls (no keys).

## Done in Sprint 2 (backend + web client)
- Server cart, httpOnly cookie sessions, S3-only storage, no client storage (web).
- KYC review API, credit limits/settlement, scheduled jobs (licence expiry,
  GSTIN re-check, low stock, credit reminders), audit logging, coupon rule C-21.
- Fixed: credit columns missing (all credit orders failed), low-stock query
  ambiguous, KYC count-based approval, logout never revoked tokens.
- Tests: test/sprint2.smoke.mjs (43 checks) + Sprint 1 suite pass.

- Web admin screens: KYC review (queue + detail with per-check decisions,
  document links, reject, credit limit), vendors, low stock, open credit,
  jobs; route guards for /orders and /admin. KYC approval driven end to end
  in headless Chromium.
- Mobile: Hive/shared_preferences removed, server cart, refresh token only in
  keychain, register screen split into screens/auth/register/ (not compiled).

## Known gaps
- Razorpay tested against a stand-in gateway only; run a live test-mode ₹1 payment, refund and mandate. Replacement = new order.
- External penetration test pending (internal review done, 12 findings fixed).
- Policy texts must be published by the owner.
- WhatsApp channel not wired; GSTR-8 filing manual.

## Done in Sprint 1
- Migrations fixed (02 view, 03 unique index) and 04 added (registration fields,
  kyc_documents, consent_records, audit_logs.performed_by/notes, order fixes).
- Backend compiles (was 23 errors); runtime bugs fixed: order routes/params,
  product search SQL, notification payloads, order_items/orders schema mismatches.
- customer_type in JWT and on req.user; trade pricing gated on KYC approval.
- 4-step registration: API (per-type validation, consent, 18+), KYC document
  upload (`GET/POST /api/v1/kyc/documents`), web UI, Flutter UI.
- Schedule X / NDPS hidden from search. Doctor referral bonus removed.
- Tests: 12 jest unit tests; `test/sprint1.smoke.mjs` (all checks pass locally);
  web registration driven end to end in headless Chromium.

## Still open in Sprint 1 (need owner credentials/data)
- Fill PTR/PTS/Institutional prices in `templates/01_Medicine_and_Inventory.xlsx`.
- IRIS IRP sandbox e-invoice test; GSTIN/PAN KYC API sandbox tests.
- Flutter build on a machine with the SDK (`flutter pub get`, run on device).

## Next (before beta)
Owner data and credentials (legal settings, licence register, policy texts, API keys, S3,
Razorpay, MSG91), lawyer/CA sign-off on the rulebook and Sprint 5 defaults, Flutter build,
deployment per docs/Dawabag_Beta_Deployment_Guide.docx.

## Mobile Sprint 8 — push devices, tracking, notification taps (not compiled)
- services/push_device_service.dart + device_api.dart: POST /users/me/devices after every
  sign-in (completeSignIn) and on FCM onTokenRefresh; logout sends fcm_token. The FCM token
  is read live from FirebaseMessaging, never stored; no-op when Firebase is not initialised.
- models/shipment_tracking.dart + screens/orders/widgets/tracking_timeline.dart: per-shipment
  courier scans (newest highlighted, local time, location) and the RTO notice in ShipmentTile.
- services/notification_tap_router.dart: push taps (type dispatched / out_for_delivery /
  delivered / order_status / packed / payment_confirmed + order_id) open /orders/:id once
  the router exists and the session is restored.

## Mobile Sprint 10 — patient teleconsultation (not compiled — no Flutter SDK here)
- /doctors (public directory, speciality filter, paging; qualification + council + reg. no.
  on every card, TPG 2020 / C-22), /doctors/:id (profile + 14-day slot picker, IST),
  /consultations/book (mode chips, chief complaint 3–1000, consent text = web's
  TPG_CONSENT_TEXT), /consultations (status/payment chips; pay, join, cancel with reason,
  e-prescription), /consultations/:id/join (mode + channel; no Agora SDK yet — note says the
  call client opens there), /consultations/prescriptions/:id (TPG format, check code, "You
  may buy these medicines from any pharmacy", optional "Order at Dawabag" → /use; PDF is
  web-only, no file writes).
- Fee payment: screens/consultations/consult_payment.dart mirrors CheckoutRazorpay
  (POST /consultations/:id/pay → Razorpay sheet → /pay/verify). Nothing stored locally.
- New: models/doctor.dart, consultation.dart, eprescription.dart; services/doctor_api.dart,
  consultation_api.dart; providers/doctor_provider.dart, consultation_provider.dart;
  utils/consult_format.dart; api_utils.apiDataList for list envelopes. '/consultations'
  added to protected routes; Account → My consultations wired.
- Open: booking is always for the account holder (no patient-profile picker in the app
  yet); slot_date is read as an IST calendar day whether the API sends a date or an ISO
  timestamp.

## Session history
| Date | Change |
| --- | --- |
| 2026-02-14..17 | Kilo prototype (Next.js, mock data) |
| 2026-03-30 | v2 package produced in Claude chat (not in Git) |
| 2026-09-30 | v2 imported; compliance rulebook drafted; owner decisions logged; Sprint 1 registration/KYC built and tested |
| 2026-09-30 | Standing rules (server SSOT, modular); Sprint 2 backend + web SSOT |
| 2026-09-30 | Sprint 3 backend: marketplace, allocation, settlements, refills |
| 2026-09-30 | Sprint 4: pharmacist gate, H1 register, invoices, price checks, grievances, recall, privacy |
| 2026-09-30 | Sprint 5: cancellation, returns, refunds, credit notes, checkout disclosure, policies, handover code, ADR, licences, addresses |
| 2026-10-01 | Sprint 6: security fixes, deployability, catalogue import, final records, GST reports, saved Rx, cold chain, incidents |
| 2026-10-01 | Sprint 7: purchasing, goods receipt, stock adjustments, destruction register, counts, expiry watch, AWS SDK v3 |
| 2026-10-01 | Sprints 8–13: notifications, courier, e-invoicing, purchase returns, teleconsultation, payments, security review, languages, retention, riders, call tokens, GST lock, WhatsApp |
