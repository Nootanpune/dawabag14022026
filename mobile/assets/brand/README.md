# DAWA BAG brand assets (Sprint 35)

**Source:** the owner's vector logo PDF (DAWA | BAG pill-bag with the tagline
"Your Life Saving Companion"), supplied 2026-10-02 with the brand decision in
`docs/DECISIONS.md` ("Adopt the DAWA BAG brand"). `source/logo.svg` is the
SVG export of that PDF (its colours are a slightly different conversion; the
PDF colours below are the reference). The PDF itself (1.3 MB) is kept by the
owner, not in the repo.

**Colours (from the PDF):** teal `#0397A6` (DAWA), green `#87A959` (BAG and
handle), grey `#565655` (tagline). For small text and buttons the app uses a
darker teal `#027A86` (5.1:1 on white) and `#015F68` (7.4:1), because white on
`#0397A6` is only 3.5:1 — see `lib/config/theme.dart` and
`test/sprint35_brand_contrast_test.dart`. `#0397A6` stays for the logo and large
shapes; `#87A959` is used only as a decorative accent, never for text.

**Files made from it** (by `source/make_brand_assets.py`, pymupdf + pillow):

| File | What |
|------|------|
| `logo.png`, `2.0x/logo.png`, `3.0x/logo.png` | in-app logo with tagline, 240 logical px wide (welcome, sign-in, sign-up) |
| `wordmark.png` (+ `2.0x/`, `3.0x/`) | DAWA \| BAG without the tagline, for the home app bar |
| `android/.../mipmap-*/ic_launcher.png` | launcher icon for Android 7 (bag mark on a white rounded square) |
| `android/.../mipmap-*/ic_launcher_foreground.png`, `_monochrome.png` + `mipmap-anydpi-v26/ic_launcher.xml` | adaptive / themed icon, Android 8+ |
| `android/.../drawable-*/splash_mark.png` + `values-v31`, `values-night-v31` | Android 12+ splash |
| `android/.../drawable-*/launch_logo.png` + `drawable*/launch_background.xml` | splash before Android 12 |
| `ios/.../AppIcon.appiconset/*.png` | iOS app icons (opaque white, bag mark) |
| `ios/.../LaunchImage.imageset/*.png` | iOS launch screen logo (200 pt) |

The "bag mark" is the logo's own shapes only (teal and green pill halves and
the green handle, no letters). No other artwork is used: the illustration in
the owner's mock-ups was left out because its licence is not known.

To remake everything after a logo change, from `mobile/`:
`python3 assets/brand/source/make_brand_assets.py /path/to/logo.pdf`
