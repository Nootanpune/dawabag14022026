#!/usr/bin/env bash
# Dawabag staging database backup (the `backup` service in deploy/staging/compose.yml).
#
#   backup.sh run        one backup now: pg_dump --format=custom streamed to the object store
#   backup.sh schedule   run every day at BACKUP_AT (HH:MM, Asia/Kolkata; default 02:30)
#   backup.sh latest     print "<key> <age in seconds>" of the newest backup (check.sh)
#
# The dump goes straight from pg_dump into the object store (s3.mjs): no copy is ever
# written to the server's disk, and an object appears only when pg_dump succeeded.
# Server-side encryption is on (AES-256 unless BACKUP_SSE says otherwise; C-41).
#
# Keys and retention (RUNBOOK 7c; lifecycle rule in deploy/staging/backup-lifecycle.json):
#   <prefix>monthly/YYYY/MM/dawabag-YYYYMMDD-HHMM.dump   first backup of each IST month,
#                                                        kept 8 years (GST books, C-34)
#   <prefix>daily/YYYY/MM/dawabag-YYYYMMDD-HHMM.dump     every other night, kept 35 days
# Times in names are IST. BACKUP_PRUNE=true deletes expired objects from here instead,
# for an S3-compatible store without lifecycle rules (C-44).
#
# A failed backup logs one "BACKUP FAILED …" line and exits non-zero (schedule mode
# logs it, retries once after BACKUP_RETRY_MINUTES, and carries on the next night);
# deploy/staging/check.sh fails when the newest backup is older than 26 hours.
set -uo pipefail
# shellcheck source-path=SCRIPTDIR source=lib.sh
. "$(dirname "$0")/lib.sh"
LOG_TAG=backup
PREFIX="${BACKUP_PREFIX:-backups/}"
export BACKUP_PREFIX="$PREFIX"

run_backup() {
  db_env
  local stamp ym tier key started bytes
  stamp="$(TZ=Asia/Kolkata date +%Y%m%d-%H%M)"
  ym="${stamp:0:4}/${stamp:4:2}"
  # The month's first successful backup goes to the long-retention prefix
  if s3 has "${PREFIX}monthly/$ym/" 2>/dev/null; then tier=daily
  else
    local rc=$?
    [ $rc = 1 ] || { log "BACKUP FAILED: cannot list the object store (exit $rc)"; return 1; }
    tier=monthly
  fi
  key="${PREFIX}${tier}/$ym/${PGDATABASE}-${stamp}.dump"
  # Sprint 41: the H1 register and audit-log chain heads, read just before the dump, are kept
  # with the backup (object metadata + <key>.heads.json) — a copy outside the database for the
  # restore drill (RUNBOOK §6). A database without the chains (older) is backed up without them.
  local heads=""
  heads="$(q "$PGDATABASE" -f "$(dirname "$0")/heads.sql" 2>/dev/null)" \
    || { log "WARNING: chain heads not readable (database before migration 35?); backing up without them"; heads=""; }
  started=$(date +%s)
  log "starting pg_dump of $PGDATABASE@$PGHOST to $key"
  if ! bytes="$(BACKUP_CHAIN_HEADS="$heads" s3 dump "$key" -- pg_dump --format=custom --compress=6 --no-password "$PGDATABASE")"; then
    log "BACKUP FAILED: $PGDATABASE to $key — see the lines above; no object was stored"
    record_run failed "$started" "{\"tier\": \"$tier\"}" "pg_dump or upload failed; no object was stored"
    return 1
  fi
  log "backup ok: $key (${bytes%% *} bytes, $(( $(date +%s) - started )) s, $tier${heads:+; chain heads: ${bytes#* }})"
  record_run succeeded "$started" "{\"key\": \"$key\", \"bytes\": ${bytes%% *}, \"tier\": \"$tier\"}"
  if [ "${BACKUP_PRUNE:-false}" = true ]; then
    s3 prune >&2 || log "WARNING: pruning old backups failed (the backup itself is stored)"
  fi
}

# Sprint 49: each run is noted in the database as a job_runs row named 'db_backup', so
# Admin -> Launch readiness can show when the last backup succeeded (the backup itself
# stays only in the object store). Best effort: a failure to note it never fails the
# backup, and a database without job_runs (older) is skipped.
record_run() {
  local status="$1" started="$2" summary="$3" error="${4:-}"
  q "$PGDATABASE" -v status="$status" -v started="$started" -v summary="$summary" -v error="$error" >/dev/null 2>&1 <<'SQL' \
    || log "WARNING: could not note this backup run in the database (job_runs)"
INSERT INTO job_runs (job_name, started_at, finished_at, status, summary, error)
VALUES ('db_backup', to_timestamp(:'started'::bigint), now(), :'status', :'summary'::jsonb, NULLIF(:'error', ''));
SQL
}

latest() {
  local out rc key at
  out="$(s3 latest)"; rc=$?
  [ $rc = 0 ] || return $rc
  key="${out%%$'\t'*}" at="${out##*$'\t'}"
  echo "$key $(( $(date +%s) - at ))"
}

# Seconds from now until the next HH:MM in Asia/Kolkata (the container clock is UTC)
seconds_until() {
  local h m now_h now_m now_s target nowsod
  IFS=: read -r h m <<<"$1"
  read -r now_h now_m now_s <<<"$(TZ=Asia/Kolkata date '+%H %M %S')"
  target=$(( 10#$h * 3600 + 10#$m * 60 ))
  nowsod=$(( 10#$now_h * 3600 + 10#$now_m * 60 + 10#$now_s ))
  echo $(( (target - nowsod + 86399) % 86400 + 1 ))
}

schedule() {
  local at="${BACKUP_AT:-02:30}" wait
  [[ "$at" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || { log "BACKUP FAILED: BACKUP_AT must be HH:MM, got '$at'"; exit 2; }
  if [ -z "${BACKUP_S3_BUCKET:-}${AWS_S3_BUCKET:-}" ]; then
    # Not configured (e.g. CI or a fresh server): stay up and say so, never crash-loop
    log "WARNING: backups are OFF — set BACKUP_S3_BUCKET (or AWS_S3_BUCKET) in staging.env"
    while :; do sleep 86400; done
  fi
  log "nightly backups at $at Asia/Kolkata to ${BACKUP_S3_BUCKET:-$AWS_S3_BUCKET}/${PREFIX}"
  while true; do
    wait=$(seconds_until "$at")
    log "next backup in $(( wait / 3600 )) h $(( wait % 3600 / 60 )) min"
    sleep "$wait"
    if ! run_backup; then
      sleep $(( ${BACKUP_RETRY_MINUTES:-20} * 60 ))
      log "retrying the failed backup"
      run_backup || log "BACKUP FAILED twice tonight; next attempt tomorrow at $at IST"
    fi
  done
}

case "${1:-}" in
  run) run_backup ;;
  schedule) schedule ;;
  latest) latest ;;
  *) echo "usage: $0 run|schedule|latest" >&2; exit 2 ;;
esac
