# DAWA BAG logo for PDFs

`dawabag-logo.png` (with the tagline) and `dawabag-wordmark.png` (without) are 720 px
PNG renders of `frontend-web/public/brand/dawabag-logo.svg` / `dawabag-wordmark.svg`,
which were converted from the owner's original vector PDF `logo.pdf` (Sprint 35; the
master file is kept by the owner, not in this repository). pdfkit takes PNG, not SVG.

Used by `src/utils/brand.ts`: Dawabag's own tax invoices and credit notes, and
e-prescription PDFs. A partner's invoice is the partner's own document (C-05) and
carries no Dawabag logo, only "Ordered through the DAWA BAG platform".
Email headers link to the website copy (`/brand/dawabag-logo-email.png`).
