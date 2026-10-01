# Browser tests (Playwright)

The Dawabag website in Chromium, desktop and phone sizes, against a running API:
search, product page declarations (C-17), sign-in with an httpOnly session cookie,
the server-held cart (seen again from a fresh browser), admin access, nothing kept in
browser storage (standing rule), and WCAG 2.1 AA accessibility of the public pages
(axe; serious and critical problems fail).

    . scripts/dev-env.sh && scripts/dev-up.sh                 # API on :4000
    (cd frontend-web && NODE_ENV=production NEXT_PUBLIC_API_URL=$API_URL npm run build && NODE_ENV=production npx next start -p 3000 &)
    cd e2e && npm ci && npx playwright test

Test people (mobiles 90000019xx) and products (SKU E2E-) are created before the run
and removed after it. CI runs this on every push (job "browser").
