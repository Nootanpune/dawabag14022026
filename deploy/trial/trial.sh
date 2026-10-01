#!/usr/bin/env bash
# Runs on the TRIAL server, as the `dawabag` user, from the copy in ~/dawabag
# (the deploy workflow calls it; you can too, e.g. in the DigitalOcean console:
# `sudo -iu dawabag dawabag/deploy/trial/trial.sh status`).
#
#   trial.sh up          build and start everything (the API migrates the database on start)
#   trial.sh ready       wait until the API answers over HTTPS (up to 10 minutes)
#   trial.sh seed        load / refresh the demo data (src/scripts/demoSeed.ts; refused unless APP_ENV=trial)
#   trial.sh unseed      remove the demo data again (refused once demo accounts have orders)
#   trial.sh backup-once take a database backup now if the store has none yet
#   trial.sh check       the staging checks: HTTPS, headers, CORS, closed ports, backup age
#   trial.sh status      containers and disk
#   trial.sh logs [svc]  recent logs
#   trial.sh reset       DELETE all trial data (database, files, backups) and start empty
#   trial.sh down        stop everything, keep the data
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/deploy/staging/staging.env"
[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE yet: run the GitHub workflow \"Deploy trial server\" first." >&2; exit 1; }
val() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 | tr -d '\r'; }
profile=()
[ "$(val S3_ENDPOINT)" = "http://objectstore:9000" ] && profile=(--profile objectstore)
dc() { docker compose "${profile[@]}" -f "$ROOT/deploy/staging/compose.yml" --env-file "$ENV_FILE" "$@"; }
API_DOMAIN="$(val API_DOMAIN)" WEB_DOMAIN="$(val WEB_DOMAIN)"

case "${1:-}" in
  up)
    dc up -d --build --remove-orphans
    if [ ${#profile[@]} -gt 0 ]; then
      # The bucket exists and an encrypted write works before anything is uploaded
      timeout 300 docker compose "${profile[@]}" -f "$ROOT/deploy/staging/compose.yml" --env-file "$ENV_FILE" wait objectstore-init >/dev/null \
        || { dc logs --no-log-prefix objectstore objectstore-init | tail -20; echo "Object store not ready" >&2; exit 1; }
      dc logs --no-log-prefix objectstore-init | tail -3
    fi
    ;;
  ready)
    for _ in $(seq 1 60); do
      if curl -fsS -o /dev/null --resolve "$API_DOMAIN:443:127.0.0.1" "https://$API_DOMAIN/ready"; then echo "API ready at https://$API_DOMAIN"; exit 0; fi
      sleep 10
    done
    echo "The API did not become ready in 10 minutes" >&2; dc ps -a; dc logs --tail 60 api caddy; exit 1
    ;;
  seed) dc exec -T -e DEMO_SEED=true api node dist/scripts/demoSeed.js ;;
  unseed) dc exec -T -e DEMO_SEED=true api node dist/scripts/demoSeed.js --remove ;;
  backup-once)
    rc=0; dc exec -T backup /app/backup/backup.sh latest >/dev/null 2>&1 || rc=$?
    case $rc in
      0) echo "A backup is already in the store" ;;
      3) echo "Backups are off (no bucket configured)" ;;
      *) dc exec -T backup /app/backup/backup.sh run ;;
    esac
    ;;
  check) WEB_DOMAIN="$WEB_DOMAIN" API_DOMAIN="$API_DOMAIN" "$ROOT/deploy/staging/check.sh" ;;
  status) dc ps -a; df -h / | tail -1; free -h | sed -n 1,3p ;;
  logs) shift; dc logs --tail 100 "$@" ;;
  reset)
    # Throwaway trial data only: the database and the object store (photos, prescriptions,
    # backups) are deleted, then everything starts empty. Caddy's certificates are kept
    # (Let's Encrypt limits how often the same names may be issued).
    dc down --remove-orphans
    docker volume rm dawabag-staging_postgres_data dawabag-staging_objectstore_data 2>/dev/null || true
    "$0" up
    ;;
  down) dc down ;;
  *) sed -n '2,20p' "$0"; exit 2 ;;
esac
