#!/usr/bin/env bash
# Load test of the busiest customer paths (search, product page, cart, checkout
# preview) against a running local API, with 500 throwaway products. Prints JSON:
# requests/s and latency (ms) per scenario and concurrency. Numbers are for this
# machine; use them to compare builds and to size the server, not as promises.
#   . scripts/dev-env.sh && scripts/dev-up.sh && scripts/load-test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DATABASE_URL:?source scripts/dev-env.sh first}"
node scripts/load/run.mjs
