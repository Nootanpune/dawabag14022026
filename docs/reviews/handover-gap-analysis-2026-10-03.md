# Gap analysis: owner's handover (2026-10-03) compared with the live Dawabag codebase

Sources: the handover `DAWABAG_HANDOVER_20261003/` (HANDOVER.md D1–D22 / O1–O15, URS-01 Rev 00, DB-01 Rev 00, `02_backend_src/src/services/sale.ts`), compared with the repo at `/home/user/dawabag14022026` (migrations `database/01..32`, `backend/src`, `docs/DECISIONS.md`). Everything below was checked by reading the code. Nothing in the repo was changed.

> **Owner rulings applied here (2026-10-03):** (1) The marketplace stays. Dawabag sells through partners such as Nootan, and handover D2 (seller-only) is **REJECTED**. (2) No legal-opinion lock on sales. Partners invoice with their own pharmacist checking every order, so handover D1 (`GATE_CLOSED`) is **REJECTED** as a blocker. Instead, an admin emergency stop for prescription-medicine sales, open by default, is **confirmed** for Sprint 38. (3) Everything else in the handover that strengthens Dawabag is to be built. §5.1 is therefore the full Sprint 38+ backlog, adapted to the marketplace: per-seller H1 registers, frozen sale fields per shipment, and provenance for partner stock as well as our own.

Labels: **HAVE** = we already have it · **PARTIAL** = some of it exists · **MISSING** = not built · **CONFLICT** = clashes with a decision in DECISIONS.md · **N/A** = not applicable or replaced by something we have.

---

## 1. Decisions D1–D22

| # | Handover decision | Status | Evidence / what is missing |
|---|---|---|---|
| D1 | A written legal opinion gates all regulated sales (`503 GATE_CLOSED`) | **REJECTED by the owner (2026-10-03)**. Before the ruling this was a conflict. | The code has no gate or kill switch. A grep for kill, gate or sales_enabled finds nothing; the only nearby control is `paymentMode()` returning `unavailable`, which hides payment methods. Our current position is in `context.md`: "beta now waits mainly on owner data, keys and the lawyer/CA sign-off". So the lawyer's sign-off is a deployment step, not a switch in the code. Sprints 1–37 build a working transacting platform. **Owner ruling:** no lock on sales, because partners invoice with their own pharmacist checking every order. An admin emergency stop for prescription sales, open by default, was **confirmed by the owner** for Sprint 38 (§5.1 #14). |
| D2 | Launch as seller only. The marketplace is deferred. | **REJECTED by the owner (2026-10-03)**. Our marketplace stays. | DECISIONS 2026-09-30: "**Marketplace partners invoice as seller of record.** Dawabag is the platform; the licensed partner whose premises dispatch the goods issues the tax invoice." Partner allocation, settlements, TCS/TDS and live stock feeds (Sprints 3, 27–37) are all built on this. |
| D3 | Track the draft 2026 Bill as direction: notification-driven eligibility, GDP, provenance, product class, new-drug flag | **PARTIAL** | GDP and provenance are partial (D17, D18). The notification-driven eligibility flag, `product_class` and `is_new_drug` are MISSING (D4, D6). |
| D4 | Each SKU has an online-sale status (`permitted/restricted/prohibited`) with a dated notification reference, set by the QP, logged so it cannot be changed, no code deploy needed | **MISSING** | Products have only `is_active`, `catalogue_state` (live/draft/not_listed/rejected; mig 24) and `telemedicine_list` (mig 13). **The "switched-off lists" from Sprint 34 are not this.** They switch off *categories and HSN codes* (mig 29 §3, constraints `products_category_switched_off` / `products_hsn_switched_off`), not individual SKUs, and they record no notification reference. Today a banned SKU can only be taken off sale by deactivating it, which records no gazette reference and has no status log of its own. |
| D5 | A database CHECK means Schedule X and NDPS can never be `permitted` | **PARTIAL** | We block them in the application everywhere: `orderPlacement.service.ts:134`, `productCards.ts:31`, `productSearch.service.ts:74`, catalogue import `validate.ts:102`, drafts `rules.ts:18` (approved as `not_listed`). The telemedicine list is forced to `prohibited` by a trigger (mig 13/15). **No database CHECK stops `is_active = TRUE AND drug_schedule IN ('Schedule X','NDPS')`**: `products_active_only_live` only checks `catalogue_state`. |
| D6 | `product_class` (drug, device, cosmetic, general) | **MISSING** | No such column in any migration. |
| D7 | Four price fields in paise, chosen on the server from the buyer's customer type | **HAVE** (ours is stronger) | `utils/customerType.ts` `priceField()`. `orderPlacement.service.ts:113-160` picks the price on the server from `effectiveCustomerType` (a B2B account that is not KYC-approved pays retail). Database CHECKs `products_price_le_mrp` and `products_mrp_le_ceiling` (mig 07, C-16) are not in DB-01. Small gap: the order line stores `unit_price_paise` but not *which* price field was used. |
| D8 | Four customer types, including doctor/hospital | **HAVE** | `BUYER_TYPES` in `customerType.ts`. KYC document matrix in `requiredKycDocuments()`. Doctors declare "own patients, not for resale" on every order (`practitioner_declared_at`, C-15). |
| D9 | No B2B sale without a verified, in-date buyer licence. No regex on licence numbers. | **HAVE** | `party_licences` (mig 25): verified/pending/superseded, `valid_upto`, a `number_key` normalised for duplicate checks, no regex. `licences/input.ts` only checks length (3–100). A lapsed licence drops the buyer to retail at once (DECISIONS 2026-10-02 "Who may sell to whom") plus a daily C-14 block. Buyer licences are copied onto the order (`orders.buyer_drug_licences`). |
| D10 | A pharmacist is a named person with registration number, council and validity. A lapsed registration blocks verification. | **PARTIAL** | Staff: `users.pharmacist_reg_no` only (mig 07). `rxVerification.service.ts:27-33` checks only that the number is present. Partners: `vendor_pharmacists` (mig 23) holds name and registration number with no validity. **No council, valid-till, document or verified-by for any pharmacist**, so a lapsed registration cannot block anyone. The number is typed in by an admin (`PATCH /admin/users/:id/pharmacist`). |
| D11 | Prescription validity and retention are separate clocks | **PARTIAL** | `prescriptions.valid_until` is set at verification, with a 180-day maximum age (`rxVerification.service.ts:25`). Retention is a policy rule: prescriptions are never purged (`retention.service.ts:3`, RUNBOOK C-34). There is no `retain_until` date, so nothing can drive a lawful purge after the retention period ends. |
| D12 | A prescription cannot be changed once verified (DB trigger). Partial dispensing is kept in a ledger. | **PARTIAL** | Only the app enforces it: verify and reject refuse unless the status is `pending` (`rxVerification.service.ts:62,110`). **No trigger on `prescriptions`**, which is not in the `dawabag_records_are_final` lists (mig 09/10/13). Verified rows are still updated by `rxReuse.service.ts:29` and `eprescription.service.ts:132` (they set `order_id`). Partial dispensing is tracked as a running counter, `prescription_items.dispensed_qty`, with a CHECK `<= prescribed_qty` (mig 07). The counter is decremented on cancellation (`cancellation.service.ts:38`), `prescribed_qty` can be overwritten (`ON CONFLICT DO UPDATE`), and rows `ON DELETE CASCADE`. It is not an append-only ledger. Which order line used the prescription is recorded in `order_items.prescription_id`. |
| D13 | (a) No cash on delivery for prescription orders. (b) A prescription order cannot reach payment until the prescription is uploaded and verified. | (a) **HAVE**, stronger · (b) **CONFLICT** | (a) There is no COD at all: `paymentOptions.controller.ts:24` returns `cash_on_delivery: false`. (b) We take payment first and the pharmacist verifies afterwards: `orderPlacement` sets `pending_payment`, then `paymentCapture.moveOrderToFulfilment` sets `rx_pending`, and a refusal is refunded. DECISIONS 2026-10-02 (Sprint 35): "The check queue gets an order once it is paid". Refills differ: "those orders wait for pharmacist verification before any charge" (2026-09-30). |
| D14 | H1 register: written in the same transaction as the sale; missing prescriber details refuse the sale; append-only; hash-chained; numbered without gaps per licence; kept 3 years | **PARTIAL**, the biggest real gap | **Have:** `h1_register` (mig 07). It is written inside the dispatch transaction (`rxGate.recordH1Dispensing`, called from `fulfilment.service.ts:115` and `partnerFulfilment.service.ts:68`). UPDATE and DELETE are blocked by `h1_register_final` (mig 09). It is never purged and is exported as CSV (`fulfilment.controller.ts:132`). **Missing:** (1) **There is no prescriber address column anywhere**: not on `prescriptions`, not in `VerifyInput`, not in `h1_register`. (2) Missing details are *filled with placeholders, not refused*: `r.patient_name \|\| 'Not recorded'` and `r.prescriber_name \|\| 'Not recorded'` (`rxGate.service.ts:77-78`), and `prescriber_reg_no`, `batch_number`, `pharmacist_*` are nullable. (3) No hash chain. (4) No gapless number: the key is a UUID with no `entry_no` per seller licence. (5) The trigger can be bypassed with `SET LOCAL dawabag.maintenance='on'`, which any app-role session can set. |
| D15 | Five sale fields stored on the order and frozen after commit | **PARTIAL** | We store them **per shipment**, which is right for split marketplace orders: `order_shipments.seller_type/partner_id`, `seller_drug_licences` JSONB (mig 25), `pharmacist_name/reg_no/checked_by/at` with a DB CHECK that a release names the pharmacist (mig 30), and `orders.buyer_drug_licences` JSONB. Frozen: `seller_type`, `partner_id`, `invoice_number` and amounts (`dawabag_shipment_amounts_final`, mig 09). **Not frozen:** the licence snapshots and the pharmacist fields. **Not stored:** `sale_channel`, which is only implied by the buyer type; and the *single* licence form a line was sold under (Form 20/21/20B/21B, which `sellingRights.ts` works out on the fly). |
| D16 | Fulfilment split by role: verify, then pack, then dispatch | **HAVE** | `fulfilment.routes.ts:12-13` (`pharmacist_rx`, `pharmacist_pack`). Packing and dispatch are refused until release (`mayPack`/`mayDispatch`, `assertRxCleared`) and dispatch requires `packed` (`fulfilment.service.ts:79-104`). Since Sprint 35 every order gets a pharmacist check. |
| D17 | GDP records per lot | **PARTIAL** | Have: `products.cold_chain` and `storage_condition`; sellers must confirm cold storage; cold-chain lines go only to cold-capable sellers and pincodes (`allocation.service.ts:50,81`); at dispatch the temperature and logger ID are recorded (mig 09; `handover.service.ts:39-48`); the GRN is checked by a pharmacist. **Missing:** a per-lot log of GDP events (storage checks, temperature logs, excursions with disposition). |
| D18 | Provenance captured at receipt so it cannot be changed; unlicensed or lapsed sources refused | **HAVE** for own stock · **PARTIAL** for partner stock | `goods_receipts` and `grn_lines` (mig 10) cannot be changed (`*_final` trigger), store `supplier_dl_no` (widened to all licences in mig 25) and invoice details, and link to the batch through `inventory_batches.grn_line_id`. `supplierCheck.assertSupplierCanSupply` refuses lapsed or unapproved suppliers (C-02). Partner stock (`partner_inventory`) has no acquired-from record. The partner is the licensee and keeps its own purchase records, so this is arguably the partner's duty. |
| D19 | Cold-chain breach flags the order for pharmacist review before dispatch | **PARTIAL / different approach** | A reading outside 2–8 °C at dispatch is a **hard refusal** (409) in `handover.service.ts:44`. That is safer than a review flag, but nothing records the excursion and no pharmacist disposition exists for stock held in store. |
| D20 | DPDP: consent recorded per purpose, marketing separate, statutory retention overrides erasure | **HAVE** | `consent_records` (mig 04) is append-only; a withdrawal is a new row; trigger `consent_records_final` (mig 09). Purposes: `privacy_notice, age_18_plus, marketing, practitioner_declaration, whatsapp, health_profile` (mig 28). Marketing is opt-in with default false (`auth.controller.ts:37-44`). Erasure anonymises the person and keeps statutory records (`privacy.service.ts:134`). There is no explicit `dispensing` purpose; the privacy-notice consent covers it. The Consent Manager integration (O9) is MISSING. |
| D21 | Audit trail that cannot be changed, hash-chained, with a verify that recomputes the hashes | **PARTIAL** | `audit_logs` cannot be changed (`audit_logs_final`, mig 09; maintenance bypass as above). **No hash chain and no verify.** `utils/audit.ts` `writeAudit()` outside a transaction *swallows* failures. It is used for regulated actions such as `h1_register_exported` and `pharmacist_registration_set` (`fulfilment.controller.ts:134,153`). |
| D22 | Doctor referral scheme deleted from the data model | **HAVE** | `01_migration.sql:431` comment, DECISIONS 2026-09-30 "No doctor referral rewards" (C-20). No `doctor_referrals` or `bonus_points` remain. Leftover: `user_profiles.referral_code` is generated for **every** account, doctors included (`auth.controller.ts:222`). `referral_code` is collected on the sign-up form but `referred_by` is always written as NULL. No reward is attached, so it is legally harmless but dead code (see §5.1 #15). |

---

## 2. URS-01 requirements

| URS | Title | Status | Evidence / gap |
|---|---|---|---|
| 001 | Unique, attributable identity | HAVE | `performed_by` on `audit_logs`; per-user logins; pharmacist name and registration on release (mig 30). |
| 002 | Authentication controls | HAVE | Lockout via `failed_login_attempts`/`locked_until` (`auth.controller.ts:331-348`), password policy, httpOnly cookie, session revocation. |
| 003 | RBAC on the server, deny by default | HAVE | `authorize(...)` middleware on every route; `notFound.ts`. |
| 004 | Audit trail that cannot be changed, hash-chained, verifiable | PARTIAL | See D21: triggers yes, chain and verify no. |
| 005 | DPDP consent per purpose | HAVE | See D20. Consent Manager MISSING. |
| 006 | Health data encrypted | PARTIAL | S3 `ServerSideEncryption: 'AES256'` (`storage.service.ts:57`); TLS at nginx. `health_profiles` is plain JSONB with no column-level encryption; database at-rest encryption depends on the host. |
| 007 | Validation on the server; no false success; no regex on licence numbers | HAVE | zod everywhere; `notFound.ts`; licence numbers checked for length only. |
| 008 | Retention wins over erasure | HAVE | `retention.service.ts` header; `privacy.service.ts` anonymises and keeps records. |
| 030 | Licence as a first-class field on each sale | PARTIAL | See D15. |
| 031 | No B2B sale without a verified, in-date buyer licence | HAVE | See D9. |
| 032 | Pharmacist of record; a lapsed registration blocks | PARTIAL | Pharmacist of record HAVE; validity MISSING (D10). |
| 033 | Validity and retention clocks | PARTIAL | See D11. |
| 034 | Prescription frozen after verification; partial dispensing tracked | PARTIAL | See D12. |
| 035 | H1 register | PARTIAL | See D14. |
| 036 | Online eligibility per SKU, driven by notifications | MISSING | See D4. |
| 037 | Schedule X out of scope | HAVE (app) / PARTIAL (DB) | See D5. |
| 038 | GDP records | PARTIAL | See D17 and D19. |
| 039 | Supply provenance | HAVE (own) / PARTIAL (partner) | See D18. |
| 040 | Product class | MISSING | See D6. |
| 041 | New-drug flag | MISSING | No column. |
| 042 | Age check for scheduled drugs | PARTIAL | 18+ is confirmed per account (`age_confirmed_at`, consent `age_18_plus`). `patients.date_of_birth` exists, but no rule checks minimum age per drug. |
| 043 | Doctor referral deleted | HAVE | See D22. |
| 070 | Four customer types, type chosen first | HAVE | Four-step sign-up, KYC matrix. |
| 071 | Search; price by customer type | HAVE | Trigram search (mig 21); price chosen on the server. |
| 072 | Cart, coupons, consumer-to-consumer referral | PARTIAL | Cart on the server and coupons (+`coupon_redemptions`) HAVE. Customer-to-customer referral is not functional (field collected, never used). |
| 073 | Checkout gated on prescription; no COD; verify before payment | PARTIAL / CONFLICT | No COD HAVE. Verify-before-payment CONFLICTS (D13). |
| 074 | Order lifecycle and tracking | HAVE / PARTIAL | States, notifications, courier tracking, cancellation until packing (DECISIONS 2026-09-30). Editing an order before packing is not built. |
| 075 | Prescriptions and patients | HAVE | `patients`, `orders.patient_id`, saved and reused prescriptions (mig 09). |
| 076 | Pincode, shipping, notifications, support | HAVE | `pincode_serviceability`, free-delivery setting, grievances (mig 07), WhatsApp, SMS, email. |
| 100 | Fulfilment with separate roles | HAVE | See D16. |
| 101 | Inventory, batch, expiry, FEFO, 90-day alert | HAVE | `expiryWatch.job.ts:18` (`stock.near_expiry_days` 90); FEFO in `allocation.service.ts:122,152`; `lowStock.job`. Multiple warehouses: N/A, since partners are the other locations. |
| 102 | Vendor KYC; own pharmacists held to the same standard | PARTIAL | Vendor and party licences HAVE. Own pharmacists have no documents, validity or verification (D10). |
| 103 | Purchase orders and provenance | HAVE | PO, then GRN, then batch (mig 10). |
| 104 | Finance and GST | HAVE | GSTR-1, TCS/TDS, e-invoice, credit notes. The handover's "Bill of Supply for unregistered doc_hospital" is wrong (see §5.3). |
| 105 | Courier and dispatch aware of cold chain | PARTIAL | Temperature and logger at dispatch; cold-capable pincodes. No approved list of cold-chain couriers. |
| 106 | Reporting, including H1 | HAVE | H1 CSV export; GST reports; admin reports. |
| 107 | Super-admin; admin actions audited | HAVE | Admin actions audited (no chain). |

---

## 3. DB-01 schema controls

| Control | Status | Notes |
|---|---|---|
| Triggers that block changes | **HAVE, broader**, with gaps | Ours cover `h1_register, credit_notes(+items), audit_logs, consent_records` (mig 09), `goods_receipts, grn_lines` (10), `einvoices` (12), `digital_prescriptions(+items)` (13), `stock_adjustments` (15), `recall_alerts/lines/matches` (17), and invoice amounts on shipments and lines (09). Gaps: verified `prescriptions`, `prescription_items`, pharmacist-check fields, licence snapshots, and a status log for product eligibility. Our triggers have a maintenance bypass that DB-01 does not. |
| Hash chains (H1, audit) | **MISSING** | No `prev_hash`/`row_hash` anywhere. |
| Gapless H1 numbering per licence | **MISSING** | UUID primary key. |
| Eligibility CHECK (X/NDPS) | **PARTIAL** | App-level only (D5). |
| Provenance | **HAVE** (own stock) | GRN-based, cannot be changed. |
| GDP records | **PARTIAL** | Dispatch temperature only. |
| Two prescription clocks | **PARTIAL** | `valid_until` only. |
| Partial-dispense ledger | **PARTIAL** | Changeable counter, not append-only. |
| Frozen sale fields | **PARTIAL** | Seller and amounts frozen; licence and pharmacist snapshots not. |
| Consents per purpose | **HAVE** | Append-only; DB-01's version can be changed (`withdrawn_at` UPDATE). |
| Four price fields | **HAVE** | Plus checks against MRP and the NPPA ceiling. |
| `product_class`, `is_new_drug` | **MISSING** | — |
| `online_sale_status` + log | **MISSING** | — |
| Pharmacist validity function | **MISSING** | — |

## 4. Open items (O1–O15) and other handover parts

| Item | Status |
|---|---|
| O1 legal opinion | Not a blocker (owner ruling 2026-10-03). The lawyer/CA review of the rulebook continues as advice, not as a lock in the code. |
| O2 customer website / O3 Flutter app | **N/A**: ours exist (Next.js `frontend-web`, Flutter `mobile`). |
| O4 doctor and partner portals | **HAVE**: doctor-as-buyer + teleconsultation (Sprint 10); partner portal (Sprints 27–37). |
| O5 marketplace | **HAVE**. The owner confirmed the marketplace stays. |
| O6 `entity_credentials` / O10 JWT secret / O11 ops login / O12 pickers | **N/A**: our auth is mature (cookies, refresh, revocation, lockout). |
| O7 cart, upload, pay, cancel, list / O8 GST invoices | **HAVE**. |
| O9 Consent Manager (DPDP, Nov 2026) | **MISSING**. |
| O13 deployment | Ours: Docker plus `docs/Dawabag_Beta_Deployment_Guide.docx`. |
| O14 devices track | **MISSING** (needs `product_class` first). |
| O15 mock recall drill, self-inspection, pharmacovigilance | Pharmacovigilance **HAVE** (`adverse_event_reports` mig 08, PvPI reference, 15/30-day clock, `adverseEvent.service.ts`, C-29). Recall **HAVE** (batch recalls mig 07, recall alerts mig 17, affected-orders query in `recall.service.ts:13`). **Mock recall drill MISSING. Self-inspection register MISSING.** |
| React "Dispensary Ledger" ops portal (`03_ops_portal_src`) | **N/A**: replaced by our Next.js admin and staff screens. It also uses `#token=` in the URL, which breaks our cookie-only standing rule. |
| Handover `02_backend_src` | **N/A** as code: a different schema (`entities`/`licences`) from ours (`users`/`vendors`/`party_licences`). Use it only as reference for the H1 refusal logic. |

---

## 5. Recommendations

### 5.1 Sprint 38+ backlog: everything from the handover that strengthens Dawabag, adapted to the marketplace (in priority order)

"Seller" means the seller of record on a shipment: Dawabag (under its own licence register) or a partner (under its `party_licences`).

| # | Item | Effort | Serves |
|---|---|---|---|
| 1 | **H1 register hardening, per seller.** Add `prescriber_address` (required) to prescription verification (`VerifyInput`, `prescriptions`) and to `h1_register`. Remove the `'Not recorded'` placeholders in `rxGate.recordH1Dispensing` and **refuse dispatch** (Dawabag or partner) when prescriber name, address or registration number, patient name and address, batch, or pharmacist name and registration number is missing. The refusal rolls the dispatch back. Add `seller_licence_ref` and `entry_no`, numbered without gaps **per seller licence** under `pg_advisory_xact_lock(seller key)`. Add `prev_hash`/`row_hash` chained per seller, built from fixed-format text (UTC ISO timestamps, explicit field markers, no `concat_ws`). Add a verify endpoint. Give each partner its own H1 report in the partner portal (the partner is the licensee); Dawabag's admin sees all. | M | D14, C-09, C-05 |
| 2 | **Audit hash chain and verify.** Chain `audit_logs` (single chain, advisory lock, fixed-format text). Add a nightly `audit_chain_verify` job that alerts admins, plus an admin endpoint that recomputes each hash. All regulated actions use `writeAuditTx`; `writeAudit` may only be used for non-regulated events. | M | D21, C-46 |
| 3 | **Lock down maintenance bypasses.** `dawabag.maintenance` takes effect only for a separate DB role (check `current_user`), so the app role cannot bypass record finality. Document it in the RUNBOOK. | S | C-34, C-46 |
| 4 | **Freeze prescriptions once verified, with an append-only dispense ledger.** Add a trigger: after `status='verified'`, refuse UPDATE or DELETE except `verified → expired`. Move order links into a `prescription_orders` table (`rxReuse`, `eprescription` and refills insert there). Replace the `prescription_items.dispensed_qty` counter with an append-only `rx_dispense_ledger` (dispense and reversal rows, each with `order_item_id`, seller and pharmacist); the balance becomes a view and the CHECK becomes a trigger on the balance. `prescribed_qty` is frozen at verification. Drop `ON DELETE CASCADE`. | M | D12, C-08, C-34 |
| 5 | **Two prescription clocks.** Add `prescriptions.retain_until`, set at verification (and on the last dispense) from a setting (`retention.prescription_years`, confirmed with the lawyer). `valid_until` stays the dispensing window. Retention purges never touch a row before `retain_until`. | S | D11, C-34, C-44 |
| 6 | **Pharmacist registration validity for Dawabag and partners alike.** Add a `pharmacist_registrations` table for staff (council, number, `valid_upto`, document key in the object store, verified-by and verified-at) and the same columns on `vendor_pharmacists`. Prescription verification (`rxVerification`), Dawabag's release (`pharmacistCheck`) and the partner shipment check (`POST /partner/shipments/:id/check`) all refuse a lapsed or unverified registration with a plain message. 60/30/7/0-day expiry alerts reuse the licence job. Admin and partner screens. | M | D10, C-03, C-08, C-46 |
| 7 | **Frozen sale identity per shipment.** Add `order_shipments.sale_channel` (retail/trade), `order_items.sale_licence_form` (the one form chosen by `sellingRights.ts`) and `order_items.price_field` (offer/ptr/pts/institutional). Extend the shipment-final trigger: once the shipment is released or invoiced, freeze `seller_type`, `partner_id`, `seller_drug_licences`, `sale_channel`, `pharmacist_*` and `vendor_pharmacist_id`, and `buyer_drug_licences` on the order. | S | D15, D7, C-13, C-05 |
| 8 | **Online-sale status per SKU.** Add `products.online_sale_status` (permitted/restricted/prohibited) with `notification_ref`, reason, set-by and set-at, and an append-only `product_online_status_log`. DB CHECKs: X/NDPS are never `permitted` and never `is_active`; anything other than permitted cannot be listed. New products default to **restricted** until a pharmacist sets the status; existing live products are backfilled as permitted. Read it in the one shared buyer filter (`productCards.ts`, `productSearch`, `didYouMean`, `allocation`, `orderPlacement`, partner listing), so a gazette ban stops partner sales of that SKU at once. Pharmacist/admin screen with a required notification reference; partners are told when a listed SKU is switched off. | M | D4, D5, C-10 |
| 9 | **Partner provenance per batch.** Partner stock imports and the live feed accept the partner's supplier name, supplier licence number and purchase invoice per batch (optional at first, then required for H1 and cold-chain lines). Store them on an append-only `partner_batch_provenance` keyed by `partner_inventory` batch. Add a "who supplied this batch" lookup for the admin and the partner. For our own stock the GRN already captures provenance; add the same lookup endpoint over `grn_lines`. | M | D18, C-02, C-05, C-28 |
| 10 | **GDP records per batch (own and partner).** Add `gdp_records` (storage check, temperature log, excursion, dispatch check, disposition by a pharmacist), append-only, keyed to `inventory_batches` or `partner_inventory`. A logged cold-chain excursion makes the batch 0 sellable until a pharmacist dispositions it (for a partner batch, the partner's own pharmacist). Keep the hard refusal at dispatch when the reading is outside 2–8 °C, and log it as an excursion record. | M | D17, D19, C-25 |
| 11 | **`product_class` + `is_new_drug`.** Columns (drug/device/cosmetic/general) with defaults; catalogue import and draft columns; devices excluded from sale until a devices track exists; `is_new_drug` feeds the online-status rules in #8. | S | D6, D3, C-17 |
| 12 | **Prescription upload before payment; option to authorise and capture later.** A cart with prescription lines cannot reach payment until a prescription is uploaded or a saved one chosen; the pharmacist still verifies after payment, as decided in Sprint 35. Optional extension: Razorpay manual capture (authorise at checkout, capture on verification, release the hold on refusal). | S (upload) / M (capture) | D13, C-08, C-37 |
| 13 | **Mock recall drill + self-inspection register.** A drill runs the affected-orders query (`recall.service.ts`) for a chosen batch, own or partner, without messaging buyers, and records time-to-trace, orders and units found, and who ran it. A periodic self-inspection checklist with findings, CAPA and close-out, append-only. | S–M | O15, C-28, C-34 |
| 14 | **Emergency stop for prescription-medicine sales (CONFIRMED by the owner 2026-10-03; Sprint 38).** Open by default. A super-admin can pause prescription-medicine sales (Schedule H/H1 lines for retail buyers, across Dawabag and all partners) with a required reason and reference. The pause and the resume are both audited, and resuming is one click. While paused: such lines cannot be added to the cart or checked out, a plain banner shows on web and app, and orders already paid continue through the pharmacist check (or are cancelled and refunded only if the admin chooses that explicitly). Store it as a server setting (`sales.rx_paused`, `paused_by/at`, `reason`, `reference`), checked by the shared prescription rule in `orderPlacement`, cart and payment capture. Optional extension later: pause per partner or per product class. | S | D1 (kept as an emergency control, not a legal lock), C-08, C-46 |
| 15 | **Referral-code cleanup.** Stop issuing `referral_code` to `doc_hospital` accounts. Then either build customer-to-customer referral for customers only (URS-072) or drop the unused sign-up field. | S | D22, C-20 |
| 16 | **DPDP Consent Manager integration** (obligation from Nov 2026). Map `consent_records` purposes to the Consent Manager artefacts. | M | D20, C-41, C-44 |
| 17 | **Smaller URS gaps.** Minimum-age rule per drug, checked against `patients.date_of_birth` (URS-042). Approved cold-chain courier list enforced at booking (URS-105). Column-level encryption of `health_profiles` (URS-006). Editing an order before packing (URS-074). | S each | C-25, C-41, C-43 |

**Status after Sprint 41:** #1–#6, #8–#14 built (Sprints 38–40); #15 settled in Sprint 38; #17 approved cold-chain couriers built in Sprint 41 (min age per medicine, health-profile column encryption and editing an order before packing deferred — DECISIONS 2026-10-03 "Approved cold-chain couriers"); #16 DPDP Consent Manager not started (not yet notified); #7 frozen sale identity per shipment built in Sprint 42 (moment of sale = order placement; per shipment and per line, pharmacist of record filled once; trigger-enforced; older shipments backfilled — DECISIONS 2026-10-03 "Sale identity fixed per shipment…").

Suggested split: **Sprint 38** #1–#5 (registers and integrity) **+ #14 emergency stop (confirmed)**. **Sprint 39** #6–#9 (people, sale identity, eligibility, partner provenance). **Sprint 40** #10–#13. Then #15–#17.

### 5.2 Questions still needing an owner decision

D1 and D2 are settled by the owner's rulings and no longer listed.

1. **Should the pharmacist verify before or after payment?** (D13 says before; DECISIONS 2026-10-02 says the check starts "once it is paid".) *Recommendation:* keep pay-then-verify, but require the prescription to be uploaded before payment (#12). Consider authorise-and-capture-later so a refused buyer is never charged.
2. **Should the H1 register be numbered per seller licence, with each partner seeing its own register?** *Recommendation:* yes (#1). The partner is the licensee and seller of record.
3. **When a cold-chain shipment reads outside 2–8 °C at dispatch, refuse it or send it to a pharmacist?** (D19 says review; we hard-refuse.) *Recommendation:* keep refusing at dispatch, and add pharmacist disposition for excursions on stored batches (#10).
4. **Should new products start "restricted" until a pharmacist sets their online status?** *Recommendation:* yes for new products (fail closed); existing live products are backfilled as permitted (#8).
5. **Should partners be required to send supplier and invoice details per batch?** *Recommendation:* optional at first; required for H1 and cold-chain batches after a notice period (#9).
6. **How long do we keep prescriptions (`retain_until`)?** *Recommendation:* ask the lawyer. Use a setting, at least the H1 period of 3 years from the last dispense (#5).
7. **Should we record a separate "dispensing" consent?** *Recommendation:* no. Keep the privacy notice as the basis for dispensing; marketing stays separate.

### 5.3 Where the handover is wrong, or riskier than what we have

- **`sale.ts` trusts the client for regulated fields.** `price_field`, `sale_channel`, `sale_licence_id`, `buyer_licence_id` and `pharmacist_id` all come from the request, which contradicts its own D7 and D15. Every order line is inserted with `unit_price_paise = 0`.
- **H1 register written at the wrong time and too broadly.**
  - The entry is written when the order is *placed*, before verification and before goods leave. Ours is written at dispatch, the actual supply, with the real batch.
  - It writes an entry for every H1 line on any channel, so a lawful licensed-trade H1 sale (no prescription) would be refused.
  - It falls back to `batch='NA'` and uses the SKU as the drug name, so the "complete entry" it promises can be incomplete.
- **The hash chains break when two writes happen at once.** `trg_audit_chain` and `trg_h1_chain` read the "last row" without a lock, so concurrent inserts fork the audit chain or hit the `(licence, entry_no)` unique constraint. The hashed text includes `timestamptz::text`, which depends on the session time zone (our DB sessions run Asia/Kolkata). It also uses `concat_ws`, which silently skips NULLs. Either can make the recompute check fail on good data or pass on bad data.
- **`online_sale_status DEFAULT 'permitted'` fails open.**
- **`entity_has_valid_licence()` ignores `verified_at`.** An unverified licence counts as valid, which contradicts D9's "verified". Ours requires `status='verified'`.
- **The prescription trigger blocks every update after verification,** including `verified → expired` and links to refill orders, and the schema offers no other path for them.
- **`consents` can be changed** (`withdrawn_at` UPDATE, no trigger). Ours is append-only.
- **No price ≤ MRP or NPPA ceiling CHECKs** (C-16). Ours has both.
- **`auth.ts` creates `entity_credentials` at runtime** (DDL from app code), and the ops portal passes the JWT in the URL (`#token=`). Both break our standards.
- **"Bill of Supply for unregistered doc_hospital" (URS-104) is wrong under GST law.** A registered supplier of taxable goods issues a tax invoice to unregistered buyers too; a bill of supply is for exempt supplies or composition suppliers. Do not adopt it.
- **One `seller_entity_id` per order cannot represent orders split across sellers.** Ours records the seller of record per shipment.
- **Where we are riskier than the handover:**
  - The `'Not recorded'` H1 placeholders.
  - No prescriber address.
  - No hash chains.
  - The maintenance bypass can be set by the app role.
  - `writeAudit` swallows failures outside a transaction.
  - No DB freeze on verified prescriptions.
  - No pharmacist validity.

  Items 1–7 in §5.1 close these.
