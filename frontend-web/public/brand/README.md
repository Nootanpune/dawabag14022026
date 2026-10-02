# DAWA BAG brand files (website)

Owner decision 2026-10-02 "Adopt the DAWA BAG brand" (docs/DECISIONS.md).

**Original:** the owner's vector PDF `logo.pdf` (1 page, PDF 1.3), supplied in the
Sprint 35 session. It is not kept in the repository; ask the owner for the master file.
Everything here was rendered from that PDF:

| File | What it is |
| --- | --- |
| `dawabag-logo.svg` | Full logo as converted from the PDF (vector paths only; the tagline "Your Life Saving Companion" is outlined as paths). |
| `dawabag-wordmark.svg` | The same paths without the tagline, for headers where the tagline would be too small to read. |
| `dawabag-mark.svg` | Icon-only "bag" mark **derived** from the logo: the logo's own handle path plus a plain two-colour bag body drawn to the logo's proportions (no letters). For favicons and app icons. |
| `dawabag-logo-{240,480,960}.png`, `dawabag-wordmark-{240,480}.png` | PNG renders of the SVGs (transparent background). |
| `dawabag-logo-email.png` | Wordmark at 360 px for email headers (emails link to it on the website; set `PUBLIC_WEB_URL`). |
| `dawabag-mark-{16,32,48,64}.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `../favicon.ico` | Browser and home-screen icons (`../manifest.webmanifest`). |

Colours inside the vector file: teal `#049AA5`, green `#7DA762`, grey `#58595B`.
The owner's sampled brand colours used for the website theme are teal `#0397A6`,
green `#87A959` and grey `#565655`; see `src/app/globals.css` and `tailwind.config.js`
for the shades used for text and buttons (WCAG AA contrast).

Do not recolour, stretch or re-letter the logo. Re-render the PNGs from the SVGs if a
new size is needed (any SVG renderer; sharp was used).
