#!/usr/bin/env bash
# Brings a development machine or CI runner to a running, migrated Dawabag API:
#   . scripts/dev-env.sh && scripts/dev-up.sh
# Starts PostgreSQL and Redis if they are not already reachable (CI provides them
# as services), creates the role and database, applies database/ migrations and
# starts the API against the fake providers. Redis runs without snapshots: no
# data is kept on the machine (standing rule — the server database is the record).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${DATABASE_URL:?source scripts/dev-env.sh first}"

say() { printf '\033[1m▸ %s\033[0m\n' "$*"; }
as_postgres() { if [ "$(id -u)" = 0 ]; then su postgres -c "$1"; else sudo -u postgres sh -c "$1"; fi; }

if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; then
  say "Starting PostgreSQL"
  (service postgresql start || pg_ctlcluster "$(ls /etc/postgresql | sort -V | tail -1)" main start) </dev/null >/dev/null 2>&1
  for _ in $(seq 1 30); do pg_isready -h "$DB_HOST" -p "$DB_PORT" -q && break; sleep 1; done
fi

if ! redis-cli -u "$REDIS_URL" ping >/dev/null 2>&1; then
  say "Starting Redis (no persistence)"
  redis-server --daemonize yes --save '' --appendonly no --dir /tmp </dev/null >/dev/null 2>&1
  for _ in $(seq 1 20); do redis-cli -u "$REDIS_URL" ping >/dev/null 2>&1 && break; sleep 0.5; done
fi
redis-cli -u "$REDIS_URL" config set save '' >/dev/null 2>&1 || true

if ! psql "$DATABASE_URL" -qAtc 'SELECT 1' >/dev/null 2>&1; then
  say "Creating role $DB_USER and database $DB_NAME"
  as_postgres "psql -qc \"DO \\\$\\\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER') THEN CREATE ROLE $DB_USER LOGIN SUPERUSER PASSWORD '$DB_PASSWORD'; ELSE ALTER ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD'; END IF; END \\\$\\\$\""
  as_postgres "psql -qAtc \"SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'\" | grep -q 1 || createdb -O $DB_USER $DB_NAME"
fi

say "Applying migrations"
(cd "$ROOT/backend" && [ -d node_modules ] || (cd "$ROOT/backend" && npm ci --no-audit --no-fund >/dev/null))
(cd "$ROOT/backend" && MIGRATIONS_DIR="$ROOT/database" npx ts-node --transpile-only src/db/migrate.ts | tail -3)

if curl -sf "$API_URL/health" >/dev/null 2>&1; then
  say "API already running at $API_URL (restart it to pick up a new environment)"
  exit 0
fi
say "Starting the API at $API_URL (log: ${API_LOG:=/tmp/dawabag-api.log})"
(cd "$ROOT/backend" && nohup npx ts-node --transpile-only src/index.ts </dev/null >"$API_LOG" 2>&1 &)
for _ in $(seq 1 60); do curl -sf "$API_URL/health" >/dev/null 2>&1 && { say "API ready"; exit 0; }; sleep 1; done
echo "API did not start; last log lines:" >&2; tail -30 "$API_LOG" >&2; exit 1
