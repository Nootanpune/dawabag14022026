#!/usr/bin/env bash
# Prints a PRODUCTION_ENV (the production server's whole settings file) from
# deploy/production/production.env.example with EVERY secret freshly generated:
#
#   deploy/production/make-production-env.sh --web www.example.com --api api.example.com \
#     --apex example.com --email ops@example.com
#
# The settings go to standard output only (nothing is written to disk); the instructions go to
# standard error. Run it on a trusted computer (Linux, macOS, Git Bash, or the new server),
# copy the output ONCE into
#   1. GitHub → Settings → Environments → production → Environment secrets → PRODUCTION_ENV
#   2. the owner's password manager (a secure note named "Dawabag PRODUCTION_ENV")
# and nowhere else. Then fill the blanks marked FILL IN (Razorpay live, MSG91, AWS, …) in both
# copies and run deploy/production/check-env.sh on the filled file before saving it.
#
# Options: --web NAME --api NAME [--apex NAME | --no-apex] --email ADDRESS [--queue-prefix NAME]
# Needs only bash, od and /dev/urandom (openssl is used when present).
set -euo pipefail
WEB="" API="" APEX="" NO_APEX=false EMAIL="" QUEUE="dawabag-production"
usage() { sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//' >&2; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --web) WEB="${2:?}"; shift 2 ;;
    --api) API="${2:?}"; shift 2 ;;
    --apex) APEX="${2:?}"; shift 2 ;;
    --no-apex) NO_APEX=true; shift ;;
    --email) EMAIL="${2:?}"; shift 2 ;;
    --queue-prefix) QUEUE="${2:?}"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown option: $1" >&2; usage ;;
  esac
done
name_ok() { [[ "$1" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]]; }
for pair in "--web:$WEB" "--api:$API"; do
  name_ok "${pair#*:}" || { echo "${pair%%:*} must be a domain name (got '${pair#*:}')" >&2; usage; }
done
[ "$WEB" != "$API" ] || { echo "--web and --api must be different names" >&2; exit 2; }
if [ "$NO_APEX" = true ]; then APEX=""
elif [ -z "$APEX" ]; then APEX="${WEB#www.}"; [ "$APEX" != "$WEB" ] || APEX=""
fi
[ -z "$APEX" ] || name_ok "$APEX" || { echo "--apex must be a domain name" >&2; exit 2; }
[[ "$EMAIL" == *@*.* ]] || { echo "--email must be an e-mail address" >&2; usage; }
[[ "$QUEUE" =~ ^[A-Za-z0-9_-]{3,40}$ ]] || { echo "--queue-prefix: 3–40 letters, digits, - or _" >&2; exit 2; }

# n random bytes as hex (2n characters)
hex() {
  if command -v openssl >/dev/null 2>&1; then openssl rand -hex "$1"
  else head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; echo; fi
}

template="$(dirname "$0")/production.env.example"
[ -f "$template" ] || { echo "Missing $template (run this from a copy of the repository)" >&2; exit 1; }

sed -e "s|__WEB_DOMAIN__|$WEB|; s|__API_DOMAIN__|$API|; s|__APEX_DOMAIN__|$APEX|; s|__ACME_EMAIL__|$EMAIL|" \
    -e "s|^QUEUE_PREFIX=.*|QUEUE_PREFIX=$QUEUE|" \
    -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$(hex 24)|" \
    -e "s|^DB_APP_PASSWORD=.*|DB_APP_PASSWORD=$(hex 24)|" \
    -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(hex 48)|" \
    -e "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(hex 48)|" \
    -e "s|^TOTP_ENC_KEY=.*|TOTP_ENC_KEY=$(hex 32)|" \
    -e "s|^HEALTH_ENC_KEY=.*|HEALTH_ENC_KEY=$(hex 32)|" \
    -e "s|^DOCUMENT_LINK_SECRET=.*|DOCUMENT_LINK_SECRET=$(hex 48)|" \
    -e "s|^HANDOVER_CODE_SECRET=.*|HANDOVER_CODE_SECRET=$(hex 48)|" \
    -e "s|^SHIPROCKET_WEBHOOK_TOKEN=.*|SHIPROCKET_WEBHOOK_TOKEN=$(hex 24)|" \
    -e "s|^BACKUP_ENC_KEY=.*|BACKUP_ENC_KEY=$(hex 32)|" \
    "$template"

cat >&2 <<EOF

────────────────────────────────────────────────────────────────────────────────
PRODUCTION_ENV printed above (standard output). Every secret in it is new and random.

Store it in exactly TWO places, and nowhere else (no e-mail, chat, document or repository):
  1. GitHub → the repository → Settings → Environments → production →
     Environment secrets → Add secret → name PRODUCTION_ENV, value: all the lines above.
  2. The owner's password manager: a secure note "Dawabag PRODUCTION_ENV".

Then fill the blanks marked "FILL IN" (AWS, backup bucket, Razorpay LIVE, MSG91, and the
optional Firebase / Shiprocket / Agora / IRP keys) in BOTH copies, and check the filled file:
  deploy/production/check-env.sh <file>      (it never prints a value)

KEEP THESE STABLE — they cannot be recovered or replaced without loss:
  • TOTP_ENC_KEY    lost/changed → every enrolled authenticator app stops working
                    (staff and partners sign in with a recovery code or are reset).
  • HEALTH_ENC_KEY  lost/changed → buyers' allergies / conditions / medicines are unreadable
                    (rotate only as RUNBOOK §6 "Health data key" says).
  • BACKUP_ENC_KEY  lost → EVERY backup made with it is unreadable, including the 8-year
                    monthly copies (GST books, C-34). Rotate only with BACKUP_ENC_KEY_PREVIOUS.
  • DB_PASSWORD     changing it later needs a manual ALTER ROLE on the server (RUNBOOK §6).
Never reuse a value from the trial server's TRIAL_ENV.
────────────────────────────────────────────────────────────────────────────────
EOF
