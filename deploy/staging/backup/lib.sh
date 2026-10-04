# shellcheck shell=bash
# Shared by backup.sh and ../restore.sh (sourced, not run).
# Database connection: the libpq variables PGHOST, PGPORT, PGUSER, PGPASSWORD,
# PGDATABASE (the compose service sets them), or DATABASE_URL (a development machine:
# `. scripts/dev-env.sh`), which is split into the same variables here.

BACKUP_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# One line per event, UTC timestamp first, so `docker compose logs backup` and any log
# shipper can grep for "BACKUP FAILED" / "RESTORE FAILED".
log() { printf '%s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${LOG_TAG:-backup}" "$*" >&2; }

s3() { node "$BACKUP_LIB_DIR/s3.mjs" "$@"; }

db_env() {
  if [ -n "${DATABASE_URL:-}" ] && [ -z "${PGHOST:-}" ]; then
    eval "$(node -e '
      const u = new URL(process.env.DATABASE_URL);
      const q = (s) => "\x27" + decodeURIComponent(s).replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
      console.log(`export PGHOST=${q(u.hostname)} PGPORT=${q(u.port || "5432")} PGUSER=${q(u.username)} PGPASSWORD=${q(u.password)} PGDATABASE=${q(u.pathname.slice(1))}`);')"
  fi
  : "${PGHOST:?set PGHOST… or DATABASE_URL}" "${PGDATABASE:?set PGDATABASE or DATABASE_URL}"
  export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"
}

# psql against one database, no .psqlrc, stop on the first error, bare output
q() { local db="$1"; shift; psql -X -v ON_ERROR_STOP=1 -qAt -d "$db" "$@"; }
