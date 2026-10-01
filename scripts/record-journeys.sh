#!/usr/bin/env bash
# R2 rehearsal: records every role's journey (customer, pharmacist, packer, rider,
# admin) as captioned screenshots on phone and laptop, against a fresh local API
# and a production build of the website. Payments and the document store are the
# in-memory fakes (backend/test/fakes): nothing real is called, nothing is kept.
#   scripts/record-journeys.sh /path/to/output   (default: ./journeys-out, git-ignored)
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="$(realpath -m "${1:-$root/journeys-out}")"
. "$root/scripts/dev-env.sh"
# The fakes run inside the recorder; point the API's object store at them too
export AWS_S3_BUCKET=dawabag-fake-bucket S3_ENDPOINT="http://127.0.0.1:$FAKE_PROVIDERS_PORT"
export AWS_ACCESS_KEY_ID=fake AWS_SECRET_ACCESS_KEY=fake
# Restart the API so it shares this shell's fake keys
pkill -f "ts-node --transpile-only src/inde[x]" 2>/dev/null || true
sleep 1
"$root/scripts/dev-up.sh"
cd "$root/frontend-web"
NODE_ENV=production NEXT_PUBLIC_API_URL="$API_URL" npm run build >/tmp/dawabag-web-build.log 2>&1
NODE_ENV=production PORT=3000 setsid nohup npm run start >/tmp/dawabag-web.log 2>&1 </dev/null &
for _ in $(seq 1 60); do curl -sf http://localhost:3000 >/dev/null && break; sleep 1; done
curl -sf http://localhost:3000 >/dev/null || { echo "Website did not start:" >&2; tail -20 /tmp/dawabag-web.log >&2; exit 1; }
cd "$root/e2e"
status=0
JOURNEYS_OUT="$out" npx playwright test -c journeys/journeys.config.ts || status=$?
pkill -x next-server 2>/dev/null || true
echo "Journeys written to $out (steps.json + shots/)"
exit $status
