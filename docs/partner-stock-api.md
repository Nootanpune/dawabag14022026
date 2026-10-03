# Partner stock feed — API for a partner's billing software

A partner pharmacy's billing software (for example MediVision Platinum by Allied
Softtech) can send its batch-wise stock report to Dawabag by itself, instead of a
person uploading it in the partner portal. The file goes through **exactly the same
import** as the portal upload (Sprint 27): it is read in memory on the server, the
columns are taken from the partner's saved choice (or the software's known layout),
and every line is matched and checked. The result is a **draft import** that waits in
the partner portal (**Stock import**) for the partner to review and apply within 24
hours. A person still makes the declarations on apply (cold chain, Schedule H1,
catalogue price); a file sent this way never applies stock by itself. Live mode (§6) applies quantities automatically for a partner the admin has switched to it.

## 1. Get a key

* Dawabag's admin: **Admin → Partners → (the partner) → Automatic stock upload → New key**, or
* the partner's **owner login**: **Partner portal → Upload stock → Automatic stock upload → New key**.

Name the key after the computer that will use it ("Billing PC, counter 1"). The key
looks like `dwbk_<10 letters/digits>_<43 characters>` and is **shown once**. Dawabag
keeps only a fingerprint (SHA-256) of it and its first part (the prefix), so it can
never be shown again: if it is lost, revoke it and issue a new one. A partner can have
up to 5 keys in use. Revoke a key when the computer is replaced.

A key can do one thing only: upload stock files for **that one partner**. It is not a
sign-in and works on no other address.

## 2. Send the file

```
POST https://<api host>/api/v1/partner-feed/<partner id>/stock-files
Authorization: Bearer <key>
Content-Type: multipart/form-data   (field "file")
```

`<partner id>` is shown next to the key in the portal ("Address: …"). Accepted files:
Excel (`.xlsx`) or CSV / text (`.csv`, `.txt`, `.tsv`), up to the same size as the
portal upload. Old binary `.xls` files are refused: save as `.xlsx` or CSV.

Example (placeholder values — never paste a real key into a document, chat or ticket):

```sh
curl -sS -X POST \
  -H "Authorization: Bearer dwbk_xxxxxxxxxx_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" \
  -F "file=@C:/MediVision/Reports/stock.xlsx" \
  https://api.example-dawabag.test/api/v1/partner-feed/00000000-0000-4000-8000-000000000000/stock-files
```

Answer (201):

```json
{ "success": true, "data": {
  "import_id": "…", "status": "draft",
  "summary": { "lines": 2, "matched": 1, "needs_review": 1, "problem": 0, "skipped": 4, "…": "…" },
  "next_step": "Waiting in the Dawabag partner portal (Stock import) for the partner to review and apply within 24 hours" } }
```

To test a key without sending a file:

```sh
curl -sS -H "Authorization: Bearer dwbk_xxxxxxxxxx_XXXX…" \
  https://api.example-dawabag.test/api/v1/partner-feed/<partner id>/whoami
```

## 3. Errors (plain words in `message`)

| Status | Meaning |
| --- | --- |
| 401 | No key, a malformed key, a wrong key, or a revoked key |
| 403 | The key belongs to another partner, or the partner account is not active |
| 422 | No file in the field `file`, or a file type that is not accepted |
| 429 | Too many uploads with this key this hour (default 20 an hour, `STOCK_FEED_MAX_PER_HOUR`), or too many requests from one address |

Send the key **only** in the `Authorization` header. A key in the address (`?key=…`)
is refused, and the query string of these addresses is never written to Dawabag's logs.

## 4. What Dawabag records

* The key's prefix, name, who issued it and when, last use and number of uses (shown in the portal).
* Every use and every refusal of a known key in the audit log, by prefix — never the
  key itself (Compliance Rulebook C-44, C-46).
* The import itself, marked as sent by the software (the key), not by a person.

## 5. Suggested schedule

Every 15 to 60 minutes from the billing PC (Windows Task Scheduler running the `curl`
command above after the software writes its stock report). Each upload makes a new
draft; only the newest one needs to be applied.

For a partner whose software should keep Dawabag up to date by itself, use **live
mode** (§6) instead: the same export file, uploaded every ~5 minutes, applies its
quantities automatically.

## 6. Live mode — full snapshots that apply by themselves (Sprint 37)

For a partner whose billing software is the master of its stock (first: MediVision on
the partner's own LAN server), a small **read-only connector** on the partner's network
uploads each new **full stock export** the software writes on a schedule (§6.1 — the
primary path; MediVision's data files are encrypted and are never read) or, for software
that allows it, a JSON snapshot (§6.2), every 1–5 minutes over outbound HTTPS. Nothing
connects into the partner's network.

* Live mode is **opt-in per partner**: Dawabag's admin switches it on (**Admin → Partners →
  (the partner) → Stock feed**). Until then a snapshot is refused with 409.
* Quantities of products that are already **linked and listed** apply at once — no person
  needed (owner decision 2026-10-03).
* Everything else **waits for a person** in the partner portal (**Live stock feed**) and is
  flagged URGENT there and to Dawabag's admins: new products, products the partner does not
  list yet, price / MRP changes, later expiry dates, new batches of refrigerated medicines.
* Expired, short-dated (30 days or less) or recalled batches are never offered.
* It is a **full snapshot**: a linked batch that is not in the snapshot is set to 0 on
  Dawabag (the software is the master). Never send part of the stock.
* While a partner is live, its portal stock editor and file apply are switched off: the
  software is the only authority.

### 6.1 Send the stock export file (primary path)

MediVision's data files are encrypted, so the connector does not read its database: the
software (set up by Allied Softtech) writes its **stock report** to a folder on a schedule
(about every 5 minutes) — the same Excel / CSV layouts the portal upload reads, e.g.
MediVision Platinum's "Stock Report Of Batch-wise Products" — and the connector uploads
each **new** file once. The report must list the **whole** stock (not only what changed).

```
POST https://<api host>/api/v1/partner-feed/<partner id>/stock-snapshot
Authorization: Bearer <key>
X-Snapshot-Taken-At: <when the export was written, ISO 8601 with offset>   (recommended)
Content-Type: multipart/form-data   (field "file": .xlsx, .csv, .txt or .tsv, up to 5 MB)
```

* **Order**: send the time the export file was written (its "modified" time) in the header
  `X-Snapshot-Taken-At` (or a form field `taken_at`). Without it, Dawabag uses the time the
  upload arrives. A file exported **before** the one already applied is refused (409).
* **Idempotent**: Dawabag fingerprints the file (SHA-256). The same file with the same time
  again (a retry) is a `replay` and changes nothing; the same content with a later time is
  `unchanged` (no new rows; orders dispatched since are counted again).
* Optional: `X-Snapshot-Sequence` (or field `sequence`), a whole number that increases with
  every file. Without it the export time orders the files. Use one style for a connector
  and keep to it (switching from time-ordering back to small sequence numbers is refused
  as out of order).
* The columns must be known: MediVision's layout is recognised by itself; any other layout
  is uploaded once in the portal and its columns confirmed (remembered for the partner).
* For a partner in live mode, the Sprint 36 address `…/stock-files` (§2) does the same, so
  an uploader set up from §2 keeps working once Dawabag's admin switches live mode on.
* Items without an item code in the report (MediVision's stock report has none) are
  recognised by name + pack + company; the first time, the partner links each new one to
  the Dawabag product in the portal, and it is remembered.

Example (placeholder values — never paste a real key into a document, chat or ticket);
Windows, after the export has been written:

```sh
curl -sS -X POST \
  -H "Authorization: Bearer dwbk_xxxxxxxxxx_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" \
  -H "X-Snapshot-Taken-At: 2026-10-03T15:35:00+05:30" \
  -F "file=@C:/MediVision/Export/STOCK.XLSX" \
  https://api.example-dawabag.test/api/v1/partner-feed/00000000-0000-4000-8000-000000000000/stock-snapshot
```

What the connector does (a few lines of script or a small service on the partner's PC):

1. Watch the export folder; when a new file appears, wait until its size has not changed
   for ~10 seconds (the software has finished writing it).
2. Upload it as above with its modified time in `X-Snapshot-Taken-At`.
3. On 200, remember the file as sent (and move it to a "sent" folder); on a 5xx / timeout,
   retry the **same file with the same header** (§8); on 409 "out of order", skip that file.
4. Upload only the newest file when several are waiting; older ones add nothing.

The answer is the same as for JSON (below).

### 6.2 Or send the snapshot as JSON (a connector that reads the stock itself)

```
POST https://<api host>/api/v1/partner-feed/<partner id>/stock-snapshot
Authorization: Bearer <key>
Content-Type: application/json
```

The same API key as §1 (scope "stock upload"). Body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sequence` | integer ≥ 1 | yes | Increases with **every** snapshot the connector sends; never reused. Keep it on the connector's computer (or restart from `whoami`'s `last_sequence` + 1). |
| `taken_at` | ISO 8601 date-time **with offset** (`2026-10-03T15:30:00+05:30` or `…Z`) | yes | When the connector read the stock from the software. |
| `complete` | `true` | yes | Confirms this is the whole stock. Anything else is refused. |
| `source` | text ≤ 100 | no | e.g. `"MediVision connector 1.0"` (shown to the partner). |
| `items` | array, 1 … 10,000 | yes | One entry per item **and batch**. |

Each item (unknown fields are refused, so typos are caught):

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `item_code` | text ≤ 100 | strongly advised | The software's own item code. It is how Dawabag remembers which Dawabag product the item is; without it the name + pack + company are used. |
| `item_name` | text ≤ 500 | yes | As the software shows it. |
| `pack` | text ≤ 100 | no | e.g. `10 TAB`, `100 ML`. |
| `manufacturer` | text ≤ 255 | no | Full name or the software's short code. |
| `hsn` | text ≤ 20 | no | |
| `batch` | text ≤ 100 | yes | As printed on the pack. |
| `expiry` | text | yes | `YYYY-MM-DD`, `YYYY-MM`, `MM/YY`, `MM/YYYY` or `DD/MM/YYYY` (month-only = end of that month). |
| `mrp` | number (rupees) or text | yes | Printed MRP per selling pack, e.g. `30` or `"30.00"`. |
| `rate` | number or text | no | The partner's selling rate (must not be above MRP, C-16). |
| `ptr` | number or text | no | |
| `purchase_rate` | number or text | no | Kept in the partner's own ledger, never shown to buyers. |
| `quantity` | number or text | yes | Closing stock in **selling packs** (loose units after a decimal point are dropped). A negative stock makes that line a problem: the batch is offered as 0. |
| `free_quantity` | number or text | no | Added to `quantity`. |
| `gst_rate` | number or text | no | Percent, e.g. `12`. |

The same batch may appear on several lines: quantities are added (the earliest expiry is kept).

Example (placeholder values — never paste a real key into a document, chat or ticket):

```sh
curl -sS -X POST \
  -H "Authorization: Bearer dwbk_xxxxxxxxxx_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" \
  -H "Content-Type: application/json" \
  --data @snapshot.json \
  https://api.example-dawabag.test/api/v1/partner-feed/00000000-0000-4000-8000-000000000000/stock-snapshot
```

`snapshot.json` (made-up items):

```json
{
  "sequence": 1024,
  "taken_at": "2026-10-03T15:30:00+05:30",
  "complete": true,
  "source": "MediVision connector 1.0",
  "items": [
    { "item_code": "MV00123", "item_name": "DEMOMOL 500MG TAB", "pack": "10 TAB", "manufacturer": "DEMO",
      "batch": "DM2401", "expiry": "2027-05", "mrp": 30.00, "rate": 26.00, "purchase_rate": 18.50,
      "quantity": 40, "free_quantity": 0, "gst_rate": 12 },
    { "item_code": "MV00456", "item_name": "SAMPLEZOLE 20MG CAP", "pack": "15 CAP", "manufacturer": "SMPL",
      "batch": "SZ0098", "expiry": "08/27", "mrp": 95, "quantity": 12 }
  ]
}
```

Answer (200):

```json
{ "success": true, "data": {
  "status": "applied",
  "import_id": "…", "sequence": 1024, "taken_at": "2026-10-03T10:00:00.000Z",
  "applied": { "lines": 2, "batches_set": 1, "batches_new": 1, "batches_zeroed": 3, "packs_offered": 52,
               "held_for_orders": 2, "dispatched_after_snapshot": 0 },
  "waiting_for_check": { "new": 1, "open": 4, "by_kind": { "new_product": 1, "price_change": 3 } },
  "summary": { "lines": 2, "matched": 1, "needs_review": 1, "problem": 0, "…": "…" } } }
```

`status` is `applied` (new stock), `unchanged` (a newer sequence with exactly the same
lines — nothing new is stored; only orders dispatched since are counted again) or
`replay` (the same sequence and lines again, e.g. a retry after a lost answer — the earlier
answer is repeated and nothing changes).

### 6.3 Resume after a restart (JSON / sequence numbers)

`GET …/partner-feed/<partner id>/whoami` also answers
`"stock_feed": { "mode": "live", "last_sequence": 1024, "last_taken_at": "…", "stale_after_minutes": 15 }`.
Start again at `last_sequence + 1`.

## 7. Errors in live mode

| Status | Meaning | What the connector does |
| --- | --- | --- |
| 200 | Applied, unchanged or replay | Next snapshot at the normal interval |
| 401 / 403 | Key missing, wrong, revoked, of another partner; partner not active | Stop and alert a person (retrying will not help) |
| 409 | Live mode is off for this partner; or **out of order** (an export time / `taken_at` earlier than, or a sequence lower than, the snapshot already applied); or a sequence / export time reused with a different file | Off: stop and alert. Out of order: skip that file (or, with sequence numbers, read `whoami` and continue from `last_sequence + 1`) — never resend old ones |
| 413 | Body larger than 10 MB | Contact Dawabag |
| 422 | The snapshot is not valid — the message says where (`items[3].expiry: …`); the file's columns are not known; `taken_at` / `X-Snapshot-Taken-At` unreadable or more than 5 minutes in the future (check the PC clock); an old `.xls` file | Fix the connector or the export; do not retry the same body |
| 429 | More than 120 snapshots an hour with this key (`STOCK_FEED_LIVE_MAX_PER_HOUR`), or too many requests from one address | Wait until the next hour / back off |
| 5xx, timeout, no network | Dawabag or the network had a problem | Retry with backoff (below) |

## 8. Frequency, retries and staleness

* Send a snapshot every **1 to 5 minutes** (a file export about every 5 minutes is fine),
  and only one at a time (wait for the answer).
* **Retry** a 5xx / timeout / network error with the **same body** (same file and
  `X-Snapshot-Taken-At`, or same `sequence`): a
  repeat is safe (`replay`). Back off 10 s, 30 s, 1 min, 2 min, then every 5 min, with a
  little random jitter. When a newer read of the stock is ready, stop retrying the old one
  and send the new snapshot with the next `sequence`.
* Never send an older snapshot after a newer one was accepted (it is refused).
* If no snapshot arrives within the partner's window (default **15 minutes**, set by
  Dawabag's admin), the feed is **stale**: by default none of the partner's stock is offered
  to buyers (or, if the admin chose it, only what is above a safety margin). Dawabag's admins
  are alerted once; the partner and the admin see "Stock last updated <time>". The next
  accepted snapshot restores it at once.
* Keep the computer's clock right (Windows time sync): `taken_at` is used to judge staleness
  and to subtract orders dispatched after the snapshot.

## 9. Open Dawabag orders (no double counting)

Units in Dawabag orders allocated to the partner are held back on Dawabag until the
partner **dispatches** the shipment on Dawabag. The partner must enter the sale in its
software **no later than when it presses Dispatch** (Dawabag's admin can allow a delay in
minutes per partner). Then, for each batch, Dawabag offers
`snapshot quantity − units dispatched after the snapshot was taken − units reserved for
orders not yet dispatched`, never less than 0, so an order is never counted twice. When the
software shows fewer packs than Dawabag orders hold, the partner is told (urgent item).
