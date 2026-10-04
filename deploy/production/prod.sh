#!/usr/bin/env bash
# Runs on the PRODUCTION server, as the `dawabag` user, from the copy in ~/dawabag (the
# workflow "Deploy production" calls it; an operator can too:
# `sudo -iu dawabag dawabag/deploy/production/prod.sh status`). docs/PRODUCTION.md.
#
#   prod.sh build         build this release's images (the running site is not touched)
#   prod.sh pre-backup    database backup BEFORE migrating (skipped only on the very first deploy)
#   prod.sh up            start this release: the `migrate` service applies migrations as the
#                         database owner and fixes the API's own login, then the API starts
#   prod.sh ready         wait until the API and website answer over HTTPS (up to 10 minutes)
#   prod.sh first-backup  take a backup now if the store has none yet (first deploy)
#   prod.sh check         HTTPS, redirects, headers, CORS, closed ports, backup under 26 h
#   prod.sh backup-now    a backup now (e.g. before a risky manual step)
#   prod.sh restore-check restore the newest backup into a scratch database and check it
#                         (the quarterly restore test; never touches the live database)
#   prod.sh restore-live <key>  ONLY with written approval and an incident entry: stop the API,
#                         restore that backup over the live database (restore.sh asks you to type
#                         the database name and keeps the old one), then run `prod.sh up`
#   prod.sh first-admin <mobile>  make the person who signed up with that mobile the FIRST
#                         super-admin (refused once any super-admin exists; audited)
#   prod.sh dblogin       the API's database login and its role membership (must be restricted)
#   prod.sh release       which release (commit) each container runs
#   prod.sh status        containers, disk, memory
#   prod.sh logs [svc]    recent logs
#   prod.sh tidy          remove images older than the current and two previous releases
#   prod.sh stop          stop everything, keep the data
#
# There is deliberately no seed, unseed or reset here: production never holds demo data and
# its data is never wiped by a script (RUNBOOK §8 item 0; C-34 statutory records).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HERE="$ROOT/deploy/production"
ENV_FILE="$HERE/production.env"
OVERRIDE="$HERE/compose.production.yml"
cmd="${1:-}"

case "$cmd" in
  seed|unseed|reset|demo)
    echo "Refused: '$cmd' does not exist on production (no demo data, no data wipes — RUNBOOK §8 item 0)." >&2; exit 2 ;;
  ''|-h|--help) sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac

[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE yet: run the GitHub workflow \"Deploy production\" first." >&2; exit 1; }
chmod 600 "$ENV_FILE"
val() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1 | tr -d '\r'; }
[ "$(val APP_ENV)" = production ] || { echo "Refused: $ENV_FILE is not APP_ENV=production." >&2; exit 1; }

# The shared staging stack with the production override; restore.sh / check.sh read the same two
export STACK_ENV_FILE="$ENV_FILE" STACK_COMPOSE_OVERRIDE="$OVERRIDE"
dc() { docker compose -f "$ROOT/deploy/staging/compose.yml" -f "$OVERRIDE" --env-file "$ENV_FILE" "$@"; }
API_DOMAIN="$(val API_DOMAIN)" WEB_DOMAIN="$(val WEB_DOMAIN)" APEX_DOMAIN="$(val APEX_DOMAIN)"
RELEASE="$(val DAWABAG_RELEASE)"
say() { printf '▸ %s\n' "$*"; }

db_running() { [ -n "$(dc ps -q --status running postgres 2>/dev/null)" ]; }
# Backups need the database; `run` uses this release's backup image on the stack's network
backup_run() { dc run --rm --no-deps -T backup /app/backup/backup.sh run; }

case "$cmd" in
  build)
    # Settings are checked here too (the workflow checked them before copying)
    "$HERE/check-env.sh" "$ENV_FILE"
    [ -n "$RELEASE" ] || { echo "DAWABAG_RELEASE is missing from $ENV_FILE (the workflow writes it)" >&2; exit 1; }
    say "Building release $RELEASE (the running site keeps serving)"
    dc build --pull
    ;;
  pre-backup)
    if ! db_running; then
      if docker volume inspect dawabag-production_postgres_data >/dev/null 2>&1; then
        echo "The database volume exists but PostgreSQL is not running: start it (prod.sh up) or investigate before deploying." >&2; exit 1
      fi
      say "First deploy: no database yet, nothing to back up"; exit 0
    fi
    say "Backup before migrating (release $RELEASE)"
    # The key of this backup is in the log line "backup ok: <key>"; restore it only if a migration broke data
    backup_run
    ;;
  up)
    [ -n "$RELEASE" ] || { echo "DAWABAG_RELEASE is missing from $ENV_FILE" >&2; exit 1; }
    say "Release $RELEASE: database and Redis up (unchanged containers are left alone)"
    dc up -d --no-build --wait --wait-timeout 300 postgres redis
    # Migrations first, in a one-off container of this release, while the previous API keeps
    # serving: if they fail, nothing else is replaced and the old release stays up (compose
    # would otherwise remove the old API container before the migrate service has finished).
    say "Migrations as the database owner (and the API's own restricted login)"
    dc run --rm --no-deps -T migrate
    # Then everything at once, exactly the images `build` made (the migrate service runs again
    # and finds nothing to do). The API is replaced here: a short interruption, under a minute.
    say "Starting the API, website, backups and Caddy of release $RELEASE"
    dc up -d --no-build --remove-orphans --wait --wait-timeout 600
    ;;
  ready)
    for _ in $(seq 1 60); do
      if curl -fsS -o /dev/null --resolve "$API_DOMAIN:443:127.0.0.1" "https://$API_DOMAIN/ready" \
         && curl -fsS -o /dev/null --resolve "$WEB_DOMAIN:443:127.0.0.1" "https://$WEB_DOMAIN/"; then
        echo "API ready at https://$API_DOMAIN, website at https://$WEB_DOMAIN"; exit 0
      fi
      sleep 10
    done
    echo "The site did not become ready in 10 minutes" >&2; dc ps -a; dc logs --tail 80 migrate api web caddy; exit 1
    ;;
  first-backup)
    rc=0; dc exec -T backup /app/backup/backup.sh latest >/dev/null 2>&1 || rc=$?
    case $rc in
      0) echo "A backup is already in the store" ;;
      3) echo "Backups are not configured — production must have BACKUP_S3_BUCKET" >&2; exit 1 ;;
      *) dc exec -T backup /app/backup/backup.sh run ;;
    esac
    ;;
  backup-now) dc exec -T backup /app/backup/backup.sh run ;;
  restore-check) "$ROOT/deploy/staging/restore.sh" latest ;;
  restore-live)
    key="${2:?usage: prod.sh restore-live <backup key from the backup log, or latest>}"
    [ -t 0 ] || { echo "restore-live needs a terminal (ssh -t …): it asks for a typed confirmation" >&2; exit 1; }
    echo "RUNBOOK §6 \"Restore drill\" step 2: written approval and an incident entry (Admin → Security incidents) first."
    say "Stopping the API (the website shows errors until 'prod.sh up')"
    dc stop api
    "$ROOT/deploy/staging/restore.sh" "$key" --into-live
    echo "Now: prod.sh up  (the migrate service restores the API login and privileges), then prod.sh check,"
    echo "then Admin → Record integrity → Run the check now. Drop the kept old database once verified."
    ;;
  check)
    WEB_DOMAIN="$WEB_DOMAIN" API_DOMAIN="$API_DOMAIN" REDIRECT_DOMAIN="$APEX_DOMAIN" "$ROOT/deploy/staging/check.sh"
    ;;
  first-admin)
    mobile="${2:?usage: prod.sh first-admin <10-digit mobile the person signed up with>}"
    [[ "$mobile" =~ ^[6-9][0-9]{9}$ ]] || { echo "Give the 10-digit mobile number (no +91)" >&2; exit 2; }
    # Only the very first one: later admins are made in Admin → Users by a super-admin (audited there)
    dc exec -T postgres psql -X -v ON_ERROR_STOP=1 -v mobile="$mobile" -U dawabag_user -d dawabag -qAt <<'SQL'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE role = 'super_admin' AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'a super-admin already exists: use Admin → Users';
  END IF;
END $$;
WITH u AS (UPDATE users SET role = 'super_admin' WHERE mobile = :'mobile' AND deleted_at IS NULL RETURNING id)
INSERT INTO audit_logs (user_id, action, new_value, notes)
SELECT id, 'first_super_admin_set', jsonb_build_object('role', 'super_admin'), 'prod.sh first-admin on the production server' FROM u
RETURNING 'super-admin set for user ' || user_id;
SQL
    echo "If nothing was printed, nobody has signed up with that mobile yet. Next: that person switches on two-step sign-in."
    ;;
  dblogin)
    dc exec -T postgres psql -U dawabag_user -d dawabag -Atc \
      "SELECT r.rolname, r.rolsuper, r.rolcreaterole, string_agg(g.rolname, ',') FROM pg_roles r
       LEFT JOIN pg_auth_members m ON m.member = r.oid LEFT JOIN pg_roles g ON g.oid = m.roleid
       WHERE r.rolname = '$(val DB_APP_LOGIN | grep -E '^[a-z_][a-z0-9_]*$' || echo dawabag_api)' GROUP BY 1, 2, 3"
    dc logs --no-log-prefix api | grep -m1 'PostgreSQL connected' || true
    ;;
  release)
    for id in $(dc ps -q); do
      docker inspect -f '{{.Name}}  {{.Config.Image}}  release={{index .Config.Labels "dawabag.release"}}  {{.State.Status}}' "$id"
    done
    ;;
  status) dc ps -a; df -h / | tail -1; free -h | sed -n 1,3p; echo "Server time: $(date -u '+%F %T UTC') = $(TZ=Asia/Kolkata date '+%F %T IST')" ;;
  logs) shift; dc logs --tail 200 "$@" ;;
  tidy)
    # Keep the current release and the two most recent others (fast rollback); remove the rest
    keep=("$RELEASE")
    while read -r tag; do
      [ ${#keep[@]} -ge 3 ] && break
      [[ " ${keep[*]} " == *" $tag "* ]] || keep+=("$tag")
    done < <(docker image ls --filter 'reference=dawabag-production-api' --format '{{.Tag}}')
    for repo in dawabag-production-api dawabag-production-web dawabag-production-backup; do
      while read -r tag; do
        [ -n "$tag" ] || continue
        [[ " ${keep[*]} " == *" $tag "* ]] || docker image rm "$repo:$tag" >/dev/null 2>&1 || true
      done < <(docker image ls --filter "reference=$repo" --format '{{.Tag}}')
    done
    docker image prune -f >/dev/null
    docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
    echo "Kept releases: ${keep[*]}"; df -h / | tail -1
    ;;
  stop) dc stop ;;
  *) echo "Unknown command: $cmd (prod.sh --help)" >&2; exit 2 ;;
esac
