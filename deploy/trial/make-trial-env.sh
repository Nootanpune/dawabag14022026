#!/usr/bin/env bash
# Prints a complete TRIAL_ENV (the trial server's settings, for the GitHub secret of
# that name) from deploy/trial/trial.env.example, with fresh random secrets:
#
#   deploy/trial/make-trial-env.sh 203.0.113.10 you@example.com        # sslip.io names from the IP
#   deploy/trial/make-trial-env.sh trial.example.in you@example.com    # your own domain
#
# With an IP the site is https://203-0-113-10.sslip.io, the API https://api.203-0-113-10.sslip.io
# and the object store https://files.203-0-113-10.sslip.io (sslip.io answers those names with
# that IP, so Let's Encrypt can issue certificates with no domain of your own). With a domain,
# point NAME, api.NAME and files.NAME at the server first. Output goes to the screen only.
# Needs only bash and /dev/urandom (Linux, macOS, Git Bash on Windows, or the server).
set -euo pipefail
target="${1:?usage: make-trial-env.sh <server-ip-or-domain> <your-email>}"
email="${2:?usage: make-trial-env.sh <server-ip-or-domain> <your-email>}"
[[ "$email" == *@*.* ]] || { echo "That does not look like an e-mail address: $email" >&2; exit 2; }

if [[ "$target" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then base="${target//./-}.sslip.io"
elif [[ "$target" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then base="$target"
else echo "Give the server's IPv4 address or a domain name, not: $target" >&2; exit 2; fi

hex() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
b64() { head -c 32 /dev/urandom | base64 | tr -d '\n'; }
# Easy to type on a phone, hard to guess: Dwb-xxxx-xxxx-xxxx (no 0/O/1/l)
readable() {
  local chars=abcdefghijkmnpqrstuvwxyzACDEFGHJKLMNPQRTUVWXY2345679 out=Dwb b
  for _ in 1 2 3; do out+=-; for _ in 1 2 3 4; do b=$(head -c1 /dev/urandom | od -An -tu1 | tr -d ' '); out+=${chars:$((b % ${#chars})):1}; done; done
  echo "$out"
}

template="$(dirname "$0")/trial.env.example"
[ -f "$template" ] || { template=$(mktemp); curl -fsSL "https://raw.githubusercontent.com/Nootanpune/dawabag14022026/${DAWABAG_REF:-main}/deploy/trial/trial.env.example" -o "$template"; }

sed -e "s|__BASE__|$base|g" \
    -e "s|^ACME_EMAIL=.*|ACME_EMAIL=$email|" \
    -e "s|^DB_PASSWORD=.*|DB_PASSWORD=$(hex 24)|" \
    -e "s|^DB_APP_PASSWORD=.*|DB_APP_PASSWORD=$(hex 24)|" \
    -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=$(hex 48)|" \
    -e "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=$(hex 48)|" \
    -e "s|^TOTP_ENC_KEY=.*|TOTP_ENC_KEY=$(hex 32)|" \
    -e "s|^HEALTH_ENC_KEY=.*|HEALTH_ENC_KEY=$(hex 32)|" \
    -e "s|^AWS_SECRET_ACCESS_KEY=.*|AWS_SECRET_ACCESS_KEY=$(hex 24)|" \
    -e "s|^OBJECTSTORE_KMS_KEY=.*|OBJECTSTORE_KMS_KEY=$(b64)|" \
    -e "s|^TRIAL_DEMO_PASSWORD=.*|TRIAL_DEMO_PASSWORD=$(readable)|" \
    "$template"
