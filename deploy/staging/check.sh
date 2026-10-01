#!/usr/bin/env bash
# Checks a running Dawabag staging stack from outside, through Caddy:
#   WEB_DOMAIN=staging.dawabag.in API_DOMAIN=api-staging.dawabag.in deploy/staging/check.sh
# CI adds CURL_EXTRA="-k --resolve ..." to reach a stack on the runner itself.
set -uo pipefail
: "${WEB_DOMAIN:?}" "${API_DOMAIN:?}"
WEB="https://$WEB_DOMAIN" API="https://$API_DOMAIN"
fail=0
c() { curl -s ${CURL_EXTRA:-} "$@"; }
check() { if [ "$2" = ok ]; then echo "  ok   $1"; else echo "  FAIL $1 — $3"; fail=1; fi; }

code=$(c -o /dev/null -w '%{http_code}' "$API/ready")
check "API answers /ready over HTTPS" "$([ "$code" = 200 ] && echo ok)" "$code"
code=$(c -o /dev/null -w '%{http_code}' "$WEB/")
check "website home page over HTTPS" "$([ "$code" = 200 ] && echo ok)" "$code"
loc=$(c -o /dev/null -w '%{redirect_url}' "http://$WEB_DOMAIN/" ${CURL_HTTP_EXTRA:-})
check "plain HTTP is sent to HTTPS" "$([[ "$loc" == https://* ]] && echo ok)" "$loc"
hsts=$(c -D - -o /dev/null "$WEB/" | tr -d '\r' | grep -i '^strict-transport-security')
check "HSTS header" "$([ -n "$hsts" ] && echo ok)" "missing"
body=$(c -H 'Content-Type: application/json' -d '{}' "$API/api/v1/auth/login")
check "error replies carry a request id" "$(echo "$body" | grep -q '"request_id"' && echo ok)" "$body"
acao=$(c -D - -o /dev/null -X OPTIONS -H "Origin: $WEB" -H 'Access-Control-Request-Method: POST' "$API/api/v1/auth/login" | tr -d '\r' | grep -i '^access-control-allow-origin')
check "API allows the website's origin (CORS)" "$(echo "$acao" | grep -q "$WEB" && echo ok)" "${acao:-none}"
acao=$(c -D - -o /dev/null -X OPTIONS -H "Origin: https://evil.example" -H 'Access-Control-Request-Method: POST' "$API/api/v1/auth/login" | tr -d '\r' | grep -i '^access-control-allow-origin')
check "…and no other origin" "$([ -z "$acao" ] && echo ok)" "$acao"
# A port is closed when the connection is refused (curl exit 7) or never answers (28).
# PostgreSQL and Redis drop an HTTP request without a reply (exit 52), which is "open".
closed() { c -o /dev/null --connect-timeout 3 "http://$API_DOMAIN:$1/" 2>/dev/null; local rc=$?; [ $rc = 7 ] || [ $rc = 28 ]; }
check "database port not exposed" "$(closed 5432 && echo ok)" "port 5432 answers"
check "Redis port not exposed" "$(closed 6379 && echo ok)" "port 6379 answers"
xfo=$(c -D - -o /dev/null "$WEB/" | tr -d '\r' | grep -i '^x-frame-options')
check "website cannot be framed by other sites" "$(echo "$xfo" | grep -qi deny && echo ok)" "${xfo:-missing}"

# Newest database backup in the object store is under 26 hours old (nightly backup, C-34).
# Asked through the stack's own backup container, so it runs on the staging server itself;
# skipped when that container is not running here or has no bucket (backups off).
# CHECK_BACKUP=0 skips it; BACKUP_LATEST_CMD replaces how the newest backup is found.
if [ "${CHECK_BACKUP:-auto}" != 0 ]; then
  here="$(cd "$(dirname "$0")" && pwd)"
  dc=(docker compose -f "$here/compose.yml" --env-file "$here/staging.env")
  if [ -n "${BACKUP_LATEST_CMD:-}" ]; then latest_cmd=(bash -c "$BACKUP_LATEST_CMD")
  elif [ -f "$here/staging.env" ] && [ -n "$("${dc[@]}" ps -q backup 2>/dev/null)" ]; then
    latest_cmd=("${dc[@]}" exec -T backup /app/backup/backup.sh latest)
  else latest_cmd=(); fi
  if [ ${#latest_cmd[@]} = 0 ]; then echo "  skip latest backup age — no backup container on this machine"
  else
    out=$("${latest_cmd[@]}" 2>&1); rc=$?
    if [ $rc = 3 ]; then echo "  skip latest backup age — backups are not configured (BACKUP_S3_BUCKET)"
    else
      age=${out##* }
      check "latest backup is under 26 hours old" \
        "$([ $rc = 0 ] && [[ "$age" =~ ^[0-9]+$ ]] && [ "$age" -lt $((26 * 3600)) ] && echo ok)" \
        "$([ $rc = 0 ] && echo "${out% *} is $((age / 3600)) h old" || echo "${out:-no backup found} (exit $rc)")"
    fi
  fi
fi

[ $fail = 0 ] && echo "Staging checks passed" || { echo "Staging checks FAILED"; exit 1; }
