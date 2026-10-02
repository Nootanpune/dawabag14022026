# Browser tests (Playwright)

The Dawabag website in Chromium, desktop and phone sizes, against a running API:
search, product page declarations (C-17), sign-in with an httpOnly session cookie,
the server-held cart (seen again from a fresh browser), the checkout disclosures
before payment (C-35), the prescription gate before payment (C-08), the footer's
licence and grievance details (C-04, C-36), admin and pharmacist access, nothing kept in
browser storage (standing rule), and WCAG 2.1 AA accessibility of the public pages
(axe; serious and critical problems fail).

    . scripts/dev-env.sh
    # optional: uploads to the in-memory fake object store, which global-setup then runs
    export AWS_S3_BUCKET=dawabag-fake-bucket S3_ENDPOINT="http://127.0.0.1:$FAKE_PROVIDERS_PORT" AWS_ACCESS_KEY_ID=fake AWS_SECRET_ACCESS_KEY=fake
    scripts/dev-up.sh                                          # API on :4000
    (cd frontend-web && NODE_ENV=production NEXT_PUBLIC_API_URL=$API_URL npm run build && NODE_ENV=production npx next start -p 3000 &)
    cd e2e && npm ci && npx playwright test

Without S3_ENDPOINT the prescription-upload test is skipped (the API refuses uploads
when it has no object store; nothing is ever stored locally).

Test people (mobiles 90000019xx) and products (SKU E2E-) are created before the run
and removed after it. CI runs this on every push (job "browser").

## Customer walkthrough (Sprint 26)

`walkthrough/` walks the demo customer of the trial seed (9000090001) through search,
quantity, back, cart, prescription, checkout and payment on a phone (390×844) and a
laptop, and saves numbered screenshots plus `notes.json` for review. Not a test suite;
it runs against a trial-like stack (`APP_ENV=trial`, demo seed, no Razorpay keys):

    WALKTHROUGH_OUT=/some/folder TRIAL_DEMO_PASSWORD=… npx playwright test -c walkthrough/walkthrough.config.ts
