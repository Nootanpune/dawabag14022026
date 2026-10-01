#!/usr/bin/env bash
# Restore a Dawabag staging backup from the object store and prove it is usable.
#
#   deploy/staging/restore.sh latest                 newest backup into a scratch database,
#                                                    sanity queries, summary, scratch dropped
#   deploy/staging/restore.sh <s3-key> --keep        a given backup; keep the scratch database
#   deploy/staging/restore.sh <s3-key> --into-live   restore, check, then (after a typed
#                                                    confirmation) swap it in as the live database
#
# On the staging server it runs inside the `backup` container (pg_restore, the S3 helper
# and the database settings live there). With DATABASE_URL or PGHOST set — a development
# machine after `. scripts/dev-env.sh`, or inside that container — it runs right here.
#
# The dump is streamed from the object store straight into pg_restore: nothing is written
# to this machine's disk (standing rule; C-41). The scratch database is
# ${RESTORE_DB:-dawabag_restore_check}. The live database is never overwritten in place:
# --into-live needs the API stopped, the typed database name, and keeps the old database
# renamed to <live>_pre_restore_<time> until you drop it (statutory records, C-34/C-44).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }

if [ -z "${DATABASE_URL:-}${PGHOST:-}" ]; then
  # On the server: hand over to the backup container, with a terminal when we have one
  tty=-T; [ -t 0 ] && [ -t 1 ] && tty=
  exec docker compose -f "$HERE/compose.yml" --env-file "$HERE/staging.env" exec $tty backup /app/restore.sh "$@"
fi

. "$HERE/backup/lib.sh"
LOG_TAG=restore
KEY="" KEEP=false INTO_LIVE=false
for a in "$@"; do
  case "$a" in
    --keep) KEEP=true ;;
    --into-live) INTO_LIVE=true ;;
    -h|--help) usage ;;
    -*) echo "unknown option $a" >&2; usage ;;
    *) [ -z "$KEY" ] && KEY="$a" || usage ;;
  esac
done
[ -n "$KEY" ] || usage
db_env
LIVE="$PGDATABASE"
CHECK="${RESTORE_DB:-dawabag_restore_check}"
[[ "$CHECK" =~ ^[a-z_][a-z0-9_]*$ ]] || { log "RESTORE FAILED: RESTORE_DB must be a plain lower-case name"; exit 2; }
[ "$CHECK" != "$LIVE" ] || { log "RESTORE FAILED: the scratch database cannot be the live one ($LIVE)"; exit 2; }
ADMIN_DB=postgres   # maintenance database for CREATE / DROP / RENAME

die() { log "RESTORE FAILED: $*"; exit 1; }
drop_check() { q "$ADMIN_DB" -c "DROP DATABASE IF EXISTS $CHECK WITH (FORCE)" && log "dropped $CHECK"; }

if [ "$KEY" = latest ]; then
  out="$(s3 latest)" || die "could not find the newest backup"
  KEY="${out%%$'\t'*}"
fi
log "restoring s3 object $KEY into a new database $CHECK"

[ "$(q "$ADMIN_DB" -c "SELECT 1 FROM pg_database WHERE datname = '$CHECK'")" != 1 ] || {
  [[ "$CHECK" == *restore_check* ]] || die "$CHECK already exists; choose another RESTORE_DB"
  log "an old $CHECK exists from an earlier check; replacing it"; drop_check || die "cannot drop the old $CHECK"
}
q "$ADMIN_DB" -c "CREATE DATABASE $CHECK" || die "cannot create $CHECK"
cleanup() { [ "$KEEP" = true ] || drop_check; }
trap 'cleanup' EXIT

started=$(date +%s)
# Owners and grants come from the live role; staging has one role (dawabag_user)
if ! s3 get "$KEY" | pg_restore --exit-on-error --no-owner --no-privileges -d "$CHECK"; then
  die "pg_restore of $KEY did not complete (see the lines above)"
fi
log "pg_restore finished in $(( $(date +%s) - started )) s"

# Sanity queries: the core tables answer and the migration history is there
count() { q "$CHECK" -c "SELECT count(*) FROM $1" 2>/dev/null || echo "missing"; }
users=$(count users) orders=$(count orders) products=$(count products)
migration=$(q "$CHECK" -F ' ' -c "SELECT file, to_char(applied_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') || ' IST' FROM schema_migrations ORDER BY file DESC LIMIT 1" 2>/dev/null)
live_migration=$(q "$LIVE" -c "SELECT max(file) FROM schema_migrations" 2>/dev/null || echo "unknown")
size=$(q "$CHECK" -c "SELECT pg_size_pretty(pg_database_size(current_database()))")

cat <<EOF

  Restore check  $(date -u +%Y-%m-%dT%H:%M:%SZ)
  backup         $KEY
  database       $CHECK ($size)
  users          $users
  orders         $orders
  products       $products
  last migration ${migration:-none}
  live database  $LIVE, last migration ${live_migration:-none}

EOF
ok=true
for v in "$users" "$orders" "$products"; do [ "$v" != missing ] || ok=false; done
[ -n "$migration" ] || ok=false
[ "$ok" = true ] || die "the restored database is missing core tables or its migration history"
log "restore check passed for $KEY"

if [ "$INTO_LIVE" = true ]; then
  others=$(q "$ADMIN_DB" -c "SELECT count(*) FROM pg_stat_activity WHERE datname = '$LIVE' AND pid <> pg_backend_pid()")
  [ "$others" = 0 ] || die "$others connection(s) to $LIVE are open — stop the API first: docker compose … stop api"
  { : </dev/tty; } 2>/dev/null || die "--into-live needs a terminal for the typed confirmation"
  old="${LIVE}_pre_restore_$(date -u +%Y%m%d%H%M)"
  printf '\nThis replaces the LIVE database %s with the backup above.\nThe current one is kept as %s.\nType the live database name (%s) to continue: ' "$LIVE" "$old" "$LIVE" > /dev/tty
  answer=""; read -r answer </dev/tty || true
  [ "$answer" = "$LIVE" ] || die "not confirmed; the live database is unchanged ($CHECK is dropped)"
  q "$ADMIN_DB" -c "ALTER DATABASE $LIVE RENAME TO $old" || die "could not set the live database aside; nothing changed"
  if ! q "$ADMIN_DB" -c "ALTER DATABASE $CHECK RENAME TO $LIVE"; then
    q "$ADMIN_DB" -c "ALTER DATABASE $old RENAME TO $LIVE"
    die "could not swap in the restored database; the old live database is back"
  fi
  trap - EXIT
  log "LIVE DATABASE RESTORED from $KEY; previous database kept as $old (drop it once the API is verified)"
  echo "Start the API again: docker compose -f deploy/staging/compose.yml --env-file deploy/staging/staging.env start api"
fi
