# Partner stock feed — API for a partner's billing software

A partner pharmacy's billing software (for example MediVision Platinum by Allied
Softtech) can send its batch-wise stock report to Dawabag by itself, instead of a
person uploading it in the partner portal. The file goes through **exactly the same
import** as the portal upload (Sprint 27): it is read in memory on the server, the
columns are taken from the partner's saved choice (or the software's known layout),
and every line is matched and checked. The result is a **draft import** that waits in
the partner portal (**Stock import**) for the partner to review and apply within 24
hours. A person still makes the declarations on apply (cold chain, Schedule H1,
catalogue price); the API never applies stock by itself.

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
