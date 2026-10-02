# Partner stock upload — owner guide (Sprint 27)

A partner pharmacy keeps its stock on Dawabag up to date by uploading the stock report
from its own billing software. The first partner is **Nootan Pharmaceuticals, Pune**,
whose software is **MediVision Platinum** by Allied Softtech Pvt Ltd, Pune.

The stock stays in **the partner's own stock ledger** on Dawabag (owner decision of
1 Oct 2026). Uploading never changes Dawabag's own stock or another partner's stock.

## What Nootan does (about 5 minutes)

1. In MediVision Platinum, open the **Stock Report Of Batch-wise Products** (the report
   Nootan sent on 2 Oct 2026) and **export it to Excel**. Any expiry cut-off is fine;
   the report "Expiring On Or Before 31-12-30" covers all stock.
2. On the website, sign in with the partner login and open **Upload stock** in the
   partner menu.
3. Drop the file on the page (or tap to choose it) and press **Upload and check**.
4. **Columns.** Dawabag recognises the MediVision report and fills in which column is
   the item name, batch, expiry, MRP, quantity and so on. Check them and press
   **Continue**. (For any other software, choose the columns once; they are remembered.)
5. **Check the lines.** Three tabs:
   - **Matched** — lines Dawabag knows exactly. These will be applied.
   - **Needs review** — items Dawabag could not match to exactly one catalogue
     product. Press **Choose the Dawabag product** (check the strength and pack
     carefully), or **Request as new product** / **Request all … as new products**.
   - **Problems** — lines that are left out, with the reason in plain words
     (expired, expires within 30 days, no batch, MRP missing, selling rate above MRP,
     MRP below Dawabag's selling price, Schedule X / NDPS, recalled batch).
   Totals, the title block and the "Generated at …" footer are ignored automatically.
6. Press **Apply stock**, read the summary, tick the boxes that apply (accept
   Dawabag's catalogue price for new listings; confirm 2–8 °C storage for
   refrigerated items; pharmacist details for any new Schedule H1 listing) and confirm.

A file must be applied within 24 hours of uploading (stock moves). An upload can be
applied only once; to update again, upload a fresh export.

## What "Apply" does

- Every matched batch is set to the quantity in the file (plus any free quantity).
  It never goes below what is already reserved for open Dawabag orders.
- **Batches missing from the file:** for each product that is in the file, the
  partner's other batches of that product that are not in the file are set to 0 (or to
  what is reserved for orders). A batch that is in the file on a line with a problem is
  left as it was. **Products not in the file are not changed**, so a partial export
  does no harm.
- A product the partner has not listed before becomes a **new listing**, which Dawabag
  reviews (Admin → Partner listings → approve → post live) before it is sold.
- One entry is written to the audit log for the whole file.

## How items are matched (safety first)

Look-alike drug names are a patient-safety risk, so matching is strict:

1. An item the partner (or an admin) has linked before is matched again — by the
   partner's item code, or, when the file has none (MediVision), by **name + unit +
   company code**.
2. Otherwise the catalogue product must have the **same name words and strength**,
   the **pack must not differ** (10 TAB vs 15 tablets is a different pack), the company
   must not clearly differ, and it must be the **only** such product.
3. Anything else goes to **Needs review** with suggestions. Nothing is guessed.

Most of Nootan's items are brand names and hospital injectables that are not in the
catalogue yet, so at first most lines will be **requests for new products**.

## What Dawabag's admin does with new-product requests

Admin → **Partner stock files** → **New product requests** lists each item with the
partner's name, unit, company code, GST % and MRP.

1. Create the product in **Products → New**: name, generic name, schedule (Schedule
   X and NDPS can never be sold online), HSN, GST, cold chain, prices and the copy; the
   pharmacist reviews the copy as usual.
2. Back on **Partner stock files**, press **Link product** on the request and pick it.
3. The partner's next upload matches that item automatically; on apply it becomes a
   new listing for Dawabag to approve and post live.

## Trying it on the trial server

A made-up file with the same layout as the MediVision report is in the repository:
`backend/test/fixtures/partner-stock-sample-medivision.xlsx` (and a plain CSV,
`partner-stock-sample.csv`). Sign in as the demo partner (9000090008), open **Upload
stock** and upload it: three items match the demo partner's listings, two made-up
brands go to "Needs review", and two lines show problems (expired; no batch number and
selling rate above MRP). The demo partner has no GST number, so new listings are
refused for it — that is expected.

The trial is a demonstration with throwaway data. Uploading Nootan's real report
there is possible (it holds no patient data), but almost every item will be a
"new product" request because the trial catalogue is a short demo list.

## Later: automatic updates

The upload is built so that the file format and the delivery can change without
changing the checks:

- **Scheduled file drop.** MediVision (or a small script on Nootan's billing PC) saves
  the same report every hour to a folder; a sync job sends it to Dawabag's
  `POST /api/v1/partner/stock-imports` with a partner API key, then applies it when
  everything is matched — the same checks, links and audit entry as a manual upload.
- **Direct API.** If Allied Softtech offers an export API, a connector can post the
  batch list in the same shape. Either way, lines that need review still wait for a
  person; nothing is matched by guesswork.

Both need a partner API key (machine login) and a "full stock" flag that also sets
products missing from the file to 0; neither exists yet.

## Files the partner can upload

Excel `.xlsx`, CSV / tab-separated text, and the HTML tables some software saves with
an `.xls` name, up to 5 MB and 10,000 lines. An old binary Excel 97–2003 `.xls` is
refused with the message "Open it in Excel and use Save As → Excel Workbook (.xlsx) or
CSV". The file is read in the server's memory and discarded; only the lines are kept.
