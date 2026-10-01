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

[ $fail = 0 ] && echo "Staging checks passed" || { echo "Staging checks FAILED"; exit 1; }
