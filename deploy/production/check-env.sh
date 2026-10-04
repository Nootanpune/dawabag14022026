#!/usr/bin/env bash
# Checks a Dawabag PRODUCTION settings file before it is used (Sprint 50):
#
#   deploy/production/check-env.sh production.env          # a file
#   printf '%s\n' "$PRODUCTION_ENV" | deploy/production/check-env.sh -    # standard input
#
# Refuses (exit 1) what would make production unsafe or make the API refuse to start:
# lines that are not settings, missing required keys, APP_ENV other than production,
# placeholders (change-me, __NAME__, example, your_…), demo / trial / test-only settings,
# Razorpay test keys (unless PAYMENTS_TEST_MODE=true for a dry-run day — then live keys are
# refused), missing or short encryption keys (TOTP_ENC_KEY, HEALTH_ENC_KEY, BACKUP_ENC_KEY),
# an API database password equal to the owner's, a region outside India (C-44), backups in
# the documents bucket or with the API's keys. Warns about optional integrations left blank.
# Prints key NAMES and line numbers only — never a value. Same rules as the API's own start-up
# check (backend/src/config/env.ts) plus the server-level ones; the deploy workflow and CI run it.
set -uo pipefail
src="${1:?usage: check-env.sh <file> | -}"
if [ "$src" = - ]; then text="$(cat)"; else [ -f "$src" ] || { echo "No such file: $src" >&2; exit 2; }; text="$(cat "$src")"; fi
text="$(printf '%s\n' "$text" | tr -d '\r')"

errors=0 warnings=0
gh() { [ "${GITHUB_ACTIONS:-}" = true ]; }
err()  { errors=$((errors + 1)); if gh; then echo "::error::PRODUCTION_ENV: $*"; else echo "  ERROR   $*"; fi; }
warn() { warnings=$((warnings + 1)); if gh; then echo "::warning::PRODUCTION_ENV: $*"; else echo "  warning $*"; fi; }

# 1. Every line is blank, a # comment or NAME=value (a pasted prompt or a wrapped line breaks compose)
bad=$(printf '%s\n' "$text" | grep -nvE '^[[:space:]]*$|^[[:space:]]*#|^[A-Za-z_][A-Za-z0-9_]*=' | cut -d: -f1 | paste -sd, -)
[ -z "$bad" ] || err "line(s) $bad are not settings (each line must be NAME=value or start with #)"

declare -A V=()
dups=""
while IFS= read -r line; do
  [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]] || continue
  k="${line%%=*}"
  [ -z "${V[$k]+x}" ] || dups="$dups $k"
  V[$k]="${line#*=}"
done <<<"$text"
[ -z "$dups" ] || err "set more than once:$dups (keep one line each)"
val() { printf '%s' "${V[$1]:-}"; }
has() { [ -n "${V[$1]:-}" ]; }

# 2. Required keys (the API refuses to start without the integrations among them)
REQUIRED=(APP_ENV QUEUE_PREFIX WEB_DOMAIN API_DOMAIN ACME_EMAIL
  DB_PASSWORD DB_APP_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET TOTP_ENC_KEY HEALTH_ENC_KEY BACKUP_ENC_KEY
  AWS_REGION AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_S3_BUCKET AWS_SES_FROM_EMAIL
  BACKUP_S3_BUCKET BACKUP_AWS_ACCESS_KEY_ID BACKUP_AWS_SECRET_ACCESS_KEY
  RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET MSG91_AUTH_KEY MSG91_TEMPLATE_OTP)
missing=""
for k in "${REQUIRED[@]}"; do has "$k" || missing="$missing $k"; done
[ -z "$missing" ] || err "required but empty or missing:$missing (docs/PRODUCTION.md \"Secrets\")"

# 3. Production, and nothing that belongs to a trial, staging or a test
[ "$(val APP_ENV)" = production ] || err "APP_ENV must be production"
for k in DEMO_SEED TRIAL_DEMO_PASSWORD DEMO_PAYMENTS ALLOW_MISSING_INTEGRATIONS S3_ENDPOINT S3_PUBLIC_ENDPOINT OBJECTSTORE_KMS_KEY \
         MSG91_BASE_URL GOOGLE_OAUTH_TOKEN_URL FCM_BASE_URL SHIPROCKET_BASE_URL RAZORPAY_BASE_URL; do
  ! has "$k" || err "$k must not be set on production (trial / test-only setting)"
done
[ "$(val COOKIE_SECURE)" != false ] || err "COOKIE_SECURE=false is not allowed on production"
[[ "$(val CADDY_GLOBAL_OPTIONS)" != *local_certs* ]] || err "CADDY_GLOBAL_OPTIONS=local_certs is for tests (real certificates on production)"
[ "$(val DISABLE_SCHEDULER)" != true ] || warn "DISABLE_SCHEDULER=true: licence, backup-watch and reminder jobs will not run"
! has DAWABAG_RELEASE || warn "DAWABAG_RELEASE is set by the deploy workflow; the value here is ignored"

# 4. No placeholder anywhere (the API refuses "example" in keys and secrets too)
PLACEHOLDER='change[-_ ]?(this|me)|your_|example|placeholder|__[A-Z_]+__'
ph=""
for k in "${!V[@]}"; do
  [[ "$k" = ACME_EMAIL ]] && continue
  if printf '%s' "${V[$k]}" | grep -qiE "$PLACEHOLDER"; then ph="$ph $k"; fi
done
# shellcheck disable=SC2086  # $ph is a list of key names
[ -z "$ph" ] || err "still a placeholder value: $(printf '%s\n' $ph | sort | paste -sd' ' -) (generate with make-production-env.sh; fill the FILL IN blanks)"
if printf '%s' "$(val ACME_EMAIL)" | grep -qiE 'change[-_ ]?me|__[A-Z_]+__|@example\.'; then err "ACME_EMAIL is still a placeholder"; fi

# 5. Secrets: long, random-looking, never shared between two settings
minlen() { local k="$1" n="$2"; ! has "$k" || [ "${#V[$k]}" -ge "$n" ] || err "$k must be at least $n characters (make-production-env.sh makes them)"; }
for k in JWT_ACCESS_SECRET JWT_REFRESH_SECRET TOTP_ENC_KEY HEALTH_ENC_KEY BACKUP_ENC_KEY; do minlen "$k" 32; done
for k in DOCUMENT_LINK_SECRET HANDOVER_CODE_SECRET; do minlen "$k" 32; done
minlen DB_PASSWORD 16; minlen DB_APP_PASSWORD 16
if has DB_APP_PASSWORD && ! [[ "$(val DB_APP_PASSWORD)" =~ ^[!-~]+$ ]]; then err "DB_APP_PASSWORD must be printable characters without spaces"; fi
if has DB_APP_LOGIN && ! [[ "$(val DB_APP_LOGIN)" =~ ^[a-z_][a-z0-9_]{0,62}$ ]]; then err "DB_APP_LOGIN must be a plain lower-case name"; fi
SECRETS=(DB_PASSWORD DB_APP_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET TOTP_ENC_KEY HEALTH_ENC_KEY BACKUP_ENC_KEY
  DOCUMENT_LINK_SECRET HANDOVER_CODE_SECRET SHIPROCKET_WEBHOOK_TOKEN)
for ((i = 0; i < ${#SECRETS[@]}; i++)); do
  for ((j = i + 1; j < ${#SECRETS[@]}; j++)); do
    a="${SECRETS[$i]}" b="${SECRETS[$j]}"
    if has "$a" && [ "$(val "$a")" = "$(val "$b")" ]; then err "$a and $b must be different values"; fi
  done
done
# The API's own key-rotation helper is allowed, but must differ from the current key
if has HEALTH_ENC_KEY_PREVIOUS && [[ ",$(val HEALTH_ENC_KEY_PREVIOUS)," == *",$(val HEALTH_ENC_KEY),"* ]]; then err "HEALTH_ENC_KEY_PREVIOUS must not contain the current HEALTH_ENC_KEY"; fi
if has BACKUP_ENC_KEY_PREVIOUS && [[ ",$(val BACKUP_ENC_KEY_PREVIOUS)," == *",$(val BACKUP_ENC_KEY),"* ]]; then err "BACKUP_ENC_KEY_PREVIOUS must not contain the current BACKUP_ENC_KEY"; fi

# 6. Payments: live keys, or test keys on a declared dry-run day only (C-37)
mode="$(val PAYMENTS_TEST_MODE)"
case "$mode" in ''|true|false) ;; *) err "PAYMENTS_TEST_MODE must be true or false" ;; esac
key_id="$(val RAZORPAY_KEY_ID)"
if [ "$mode" = true ]; then
  if [[ "$key_id" == rzp_live_* ]]; then err "PAYMENTS_TEST_MODE=true must not be used with Razorpay live keys"
  else warn "PAYMENTS_TEST_MODE=true: Razorpay TEST keys — a dry run, no real money. Remove before launch."; fi
elif has RAZORPAY_KEY_ID && [[ "$key_id" != rzp_live_* ]]; then
  err "RAZORPAY_KEY_ID must be a live key (rzp_live_…); test keys only with PAYMENTS_TEST_MODE=true for a dry run"
fi

# 7. Data stays in India (C-44); backups offsite, in their own bucket with their own keys
! has AWS_REGION || [ "$(val AWS_REGION)" = ap-south-1 ] || err "AWS_REGION must be ap-south-1 (documents stay in Mumbai, C-44)"
breg="$(val BACKUP_AWS_REGION)"
if has BACKUP_S3_ENDPOINT; then
  [[ "$(val BACKUP_S3_ENDPOINT)" == https://* ]] || err "BACKUP_S3_ENDPOINT must be an https:// address"
  warn "BACKUP_S3_ENDPOINT is set: confirm that store's region is in India (C-44) and that it has a lifecycle rule or BACKUP_PRUNE=true"
else
  case "$breg" in ap-south-1|ap-south-2) ;; '') warn "BACKUP_AWS_REGION not set: backups go to ap-south-1 (prefer ap-south-2 Hyderabad for an offsite copy)" ;;
    *) err "BACKUP_AWS_REGION must be an Indian region (ap-south-2 or ap-south-1), C-44" ;; esac
  [ "$breg" != ap-south-1 ] || warn "BACKUP_AWS_REGION=ap-south-1 is the same region as the server's documents; ap-south-2 (Hyderabad) gives an offsite copy"
fi
if has BACKUP_S3_BUCKET && [ "$(val BACKUP_S3_BUCKET)" = "$(val AWS_S3_BUCKET)" ]; then err "BACKUP_S3_BUCKET must be a separate bucket from AWS_S3_BUCKET"; fi
if has BACKUP_AWS_ACCESS_KEY_ID && [ "$(val BACKUP_AWS_ACCESS_KEY_ID)" = "$(val AWS_ACCESS_KEY_ID)" ]; then err "BACKUP_AWS_ACCESS_KEY_ID must be the backup-only IAM user, not the API's keys"; fi
case "$(val BACKUP_SSE)" in ''|AES256|aws:kms) ;; none) warn "BACKUP_SSE=none: only client-side encryption protects the backups" ;; *) err "BACKUP_SSE must be AES256, aws:kms or none" ;; esac
[ "$(val BACKUP_PRUNE)" != true ] || warn "BACKUP_PRUNE=true: the script deletes old backups (needs delete rights); prefer the bucket lifecycle rule"
if has BACKUP_AT && ! [[ "$(val BACKUP_AT)" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then err "BACKUP_AT must be HH:MM (Asia/Kolkata)"; fi

# 8. Names
dom() { [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]]; }
for k in WEB_DOMAIN API_DOMAIN; do ! has "$k" || dom "$(val "$k")" || err "$k must be a bare domain name (no https://, no path)"; done
! has APEX_DOMAIN || dom "$(val APEX_DOMAIN)" || err "APEX_DOMAIN must be a bare domain name, or empty"
if has WEB_DOMAIN && { [ "$(val WEB_DOMAIN)" = "$(val API_DOMAIN)" ] || [ "$(val WEB_DOMAIN)" = "$(val APEX_DOMAIN)" ] || { has APEX_DOMAIN && [ "$(val API_DOMAIN)" = "$(val APEX_DOMAIN)" ]; }; }; then
  err "WEB_DOMAIN, API_DOMAIN and APEX_DOMAIN must all be different names"
fi
for k in WEB_DOMAIN API_DOMAIN APEX_DOMAIN; do [[ "$(val "$k")" != *sslip.io ]] || err "$k is an sslip.io name (that is the trial's); use the real domain"; done
! has ACME_EMAIL || [[ "$(val ACME_EMAIL)" == *@*.* ]] || err "ACME_EMAIL must be an e-mail address"
! has QUEUE_PREFIX || [[ "$(val QUEUE_PREFIX)" =~ ^[A-Za-z0-9_-]{3,40}$ ]] || err "QUEUE_PREFIX: 3–40 letters, digits, - or _"
! has AWS_SES_FROM_EMAIL || [[ "$(val AWS_SES_FROM_EMAIL)" == *@*.* ]] || err "AWS_SES_FROM_EMAIL must be an e-mail address"

# 9. Optional integrations: complete or absent
if has AGORA_APP_ID && ! has AGORA_APP_CERTIFICATE; then err "AGORA_APP_CERTIFICATE must be set with AGORA_APP_ID (calls need signed tokens)"; fi
if has SHIPROCKET_EMAIL && ! has SHIPROCKET_PASSWORD; then err "SHIPROCKET_PASSWORD must be set with SHIPROCKET_EMAIL"; fi
irp_set=0; for k in IRP_BASE_URL IRP_CLIENT_ID IRP_CLIENT_SECRET IRP_USERNAME IRP_PASSWORD IRP_PUBLIC_KEY; do ! has "$k" || irp_set=$((irp_set + 1)); done
[ "$irp_set" = 0 ] || [ "$irp_set" = 6 ] || err "e-invoicing (IRP) incomplete: set all six IRP_* keys, or none"
! has IRP_BASE_URL || [[ "$(val IRP_BASE_URL)" == https://* ]] || err "IRP_BASE_URL must be https://"
off=""
has FCM_SERVICE_ACCOUNT_JSON || off="$off push(FCM)"
has SHIPROCKET_EMAIL || off="$off courier(Shiprocket)"
has AGORA_APP_ID || off="$off video(Agora)"
[ "$irp_set" = 6 ] || off="$off e-invoice(IRP)"
has MSG91_SENDER_ID || off="$off MSG91_SENDER_ID"
[ -z "$off" ] || warn "not configured yet (the feature stays off):$off"

if [ "$errors" -gt 0 ]; then echo "PRODUCTION_ENV check FAILED: $errors error(s), $warnings warning(s)"; exit 1; fi
echo "PRODUCTION_ENV check passed ($warnings warning(s))"
