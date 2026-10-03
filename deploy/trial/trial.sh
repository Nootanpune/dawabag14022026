#!/usr/bin/env bash
# Runs on the TRIAL server, as the `dawabag` user, from the copy in ~/dawabag
# (the deploy workflow calls it; you can too, e.g. in the DigitalOcean console:
# `sudo -iu dawabag dawabag/deploy/trial/trial.sh status`).
#
#   trial.sh up          build and start everything (the `migrate` service applies the migrations
#                        as the database owner and makes the API's own login, then the API starts)
#   trial.sh ready       wait until the API answers over HTTPS (up to 10 minutes)
#   trial.sh seed        load / refresh the demo data (src/scripts/demoSeed.ts; refused unless APP_ENV=trial)
#   trial.sh unseed      remove the demo data again (refused once demo accounts have orders)
#   trial.sh dblogin     show the API's database login and its role membership (Sprint 41)
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
# Sprint 41: the API connects as its own restricted login (RUNBOOK §6), made by the compose
# service `migrate` with DB_APP_PASSWORD. A TRIAL_ENV generated before Sprint 41 has no such
# line: then it is derived here from DB_PASSWORD (one-way; the same every run, never stored
# or printed). Adding DB_APP_PASSWORD to TRIAL_ENV later simply replaces it on the next deploy.
if [ -z "$(val DB_APP_PASSWORD)" ]; then
  owner_pw="$(val DB_PASSWORD)"
  [ -n "$owner_pw" ] || { echo "$ENV_FILE has no DB_PASSWORD" >&2; exit 1; }
  DB_APP_PASSWORD="$(printf 'dawabag-api-login:%s' "$owner_pw" | sha256sum | cut -c1-48)"
  export DB_APP_PASSWORD
  unset owner_pw
fi
# Sprint 42: the key that encrypts two-step sign-in secrets (TOTP_ENC_KEY, RUNBOOK §6). A
# TRIAL_ENV generated before Sprint 42 has none: derived here the same way (one-way, stable
# across deploys, never stored or printed). Adding TOTP_ENC_KEY later changes the key, so
# anyone already using two-step sign-in then signs in with a recovery code or is reset.
if [ -z "$(val TOTP_ENC_KEY)" ]; then
  owner_pw="$(val DB_PASSWORD)"
  [ -n "$owner_pw" ] || { echo "$ENV_FILE has no DB_PASSWORD" >&2; exit 1; }
  TOTP_ENC_KEY="$(printf 'dawabag-totp-key:%s' "$owner_pw" | sha256sum | cut -c1-64)"
  export TOTP_ENC_KEY
  unset owner_pw
fi
# Sprint 43: the key that seals health profiles at rest (HEALTH_ENC_KEY, RUNBOOK §6 "Health
# data key"). A TRIAL_ENV without it gets one derived the same way (one-way, stable across
# deploys, never stored or printed). Adding HEALTH_ENC_KEY later: put this derived value in
# HEALTH_ENC_KEY_PREVIOUS for one deploy so the API can re-seal what it sealed before.
if [ -z "$(val HEALTH_ENC_KEY)" ]; then
  owner_pw="$(val DB_PASSWORD)"
  [ -n "$owner_pw" ] || { echo "$ENV_FILE has no DB_PASSWORD" >&2; exit 1; }
  HEALTH_ENC_KEY="$(printf 'dawabag-health-key:%s' "$owner_pw" | sha256sum | cut -c1-64)"
  export HEALTH_ENC_KEY
  unset owner_pw
fi
profile=()
[ "$(val S3_ENDPOINT)" = "http://objectstore:9000" ] && profile=(--profile objectstore)
dc() { docker compose "${profile[@]}" -f "$ROOT/deploy/staging/compose.yml" --env-file "$ENV_FILE" "$@"; }
API_DOMAIN="$(val API_DOMAIN)" WEB_DOMAIN="$(val WEB_DOMAIN)"

case "${1:-}" in
  up)
    dc up -d --build --remove-orphans
    if [ ${#profile[@]} -gt 0 ]; then
      # The bucket exists and an encrypted write works before anything is uploaded
      # (not `compose wait`: it reports "no containers" once the one-shot init has
      # already finished, which on a fresh store it can do within a second)
      init_state=""
      for _ in $(seq 1 150); do
        id="$(dc ps -a -q objectstore-init)"
        init_state="$([ -n "$id" ] && docker inspect -f '{{.State.Status}} {{.State.ExitCode}}' "$id" || true)"
        case "$init_state" in exited*|dead*) break ;; esac
        sleep 2
      done
      [ "$init_state" = "exited 0" ] \
        || { dc logs --no-log-prefix objectstore objectstore-init | tail -20; echo "Object store not ready ($init_state)" >&2; exit 1; }
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
  # The demo seed runs as the database owner in the one-shot `migrate` container (removal
  # needs the maintenance role; the API's own login is never given it — Sprint 41)
  seed) dc run --rm --no-deps -T -e DEMO_SEED=true migrate node dist/scripts/demoSeed.js ;;
  unseed) dc run --rm --no-deps -T -e DEMO_SEED=true migrate node dist/scripts/demoSeed.js --remove ;;
  dblogin)
    # Which login the API uses and what it may do (expects: dawabag_api, restricted)
    dc exec -T postgres psql -U dawabag_user -d dawabag -Atc \
      "SELECT r.rolname, r.rolsuper, r.rolcreaterole, string_agg(g.rolname, ',') FROM pg_roles r
       LEFT JOIN pg_auth_members m ON m.member = r.oid LEFT JOIN pg_roles g ON g.oid = m.roleid
       WHERE r.rolname = '${DB_APP_LOGIN:-dawabag_api}' GROUP BY 1, 2, 3"
    dc logs --no-log-prefix migrate | tail -3
    dc logs --no-log-prefix api | grep -m1 'PostgreSQL connected' || true
    ;;
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
  *) sed -n '2,17p' "$0"; exit 2 ;;
esac
