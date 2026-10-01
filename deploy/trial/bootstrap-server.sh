#!/usr/bin/env bash
# Dawabag TRIAL server — one-time preparation of a fresh Ubuntu 24.04 machine
# (deploy/trial/TRIAL.md, step 2). Run once as root; safe to run again.
#
#   curl -fsSL https://raw.githubusercontent.com/Nootanpune/dawabag14022026/main/deploy/trial/bootstrap-server.sh \
#     | bash -s -- --email you@example.com
#
# It installs Docker Engine and the compose plugin from Docker's own apt repository,
# turns on the firewall (only SSH 22, HTTP 80 and HTTPS 443 open), automatic security
# updates, a 2 GB swap file when the machine has under 6 GB of memory (the website
# build needs it), and a `dawabag` user that GitHub Actions deploys as (docker group,
# SSH key only). SSH password logins are switched off.
#
# At the end it prints what to paste into GitHub (Settings → Secrets and variables →
# Actions): the server address, its SSH host key, a new deploy key (printed once, never
# kept on this server) and, with --email, a complete TRIAL_ENV with fresh random secrets
# (deploy/trial/make-trial-env.sh). Nothing secret is written to this server's disk by
# this script; the deploy workflow writes the settings file itself.
#
# Options:
#   --email ADDRESS        your e-mail (Let's Encrypt certificate notices); prints TRIAL_ENV
#   --deploy-key 'ssh-ed25519 AAAA… comment'   use your own deploy public key instead
#   --new-deploy-key       make a fresh deploy key even if one is installed (old ones stay valid)
#   --ip ADDRESS           the server's public IPv4 (found automatically otherwise)
#   --domain NAME          a real domain instead of <ip>.sslip.io (point NAME, api.NAME and
#                          files.NAME at this server first)
set -euo pipefail
# Braces: bash reads the whole script before running any of it, so nothing below can
# swallow the rest of the script from stdin when it is piped in with curl | bash
{
EMAIL="" DEPLOY_KEY="" NEW_KEY=false IP="" DOMAIN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --email) EMAIL="${2:?}"; shift 2 ;;
    --deploy-key) DEPLOY_KEY="${2:?}"; shift 2 ;;
    --new-deploy-key) NEW_KEY=true; shift ;;
    --ip) IP="${2:?}"; shift 2 ;;
    --domain) DOMAIN="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,32p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Run as root (sudo -i first)." >&2; exit 1; }
# shellcheck source=/dev/null
. /etc/os-release
[ "${ID:-}" = ubuntu ] || { echo "This script is for Ubuntu (found ${ID:-unknown})." >&2; exit 1; }
[ "${VERSION_ID:-}" = 24.04 ] || echo "Note: written for Ubuntu 24.04; found ${VERSION_ID:-?}. Continuing."
export DEBIAN_FRONTEND=noninteractive
DEPLOY_USER=dawabag

say "Base packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg rsync ufw unattended-upgrades openssl >/dev/null

say "Docker Engine and compose plugin (Docker's apt repository)"
if ! docker compose version >/dev/null 2>&1; then
  # Ubuntu's own docker packages conflict with Docker's; remove them if present
  for p in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do
    if dpkg -s "$p" >/dev/null 2>&1; then apt-get remove -y -qq "$p" >/dev/null; fi
  done
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
# Container logs rotate so they cannot fill the disk (logs are not records; the database is)
if [ ! -f /etc/docker/daemon.json ]; then
  printf '{\n  "log-driver": "json-file",\n  "log-opts": { "max-size": "10m", "max-file": "3" }\n}\n' > /etc/docker/daemon.json
  systemctl restart docker
fi
systemctl enable --now docker >/dev/null 2>&1
docker compose version

say "Firewall: only SSH (22), HTTP (80) and HTTPS (443)"
# Docker publishes only Caddy's 80 and 443 (deploy/staging/compose.yml); the database,
# Redis and the object store have no published port, so nothing else is reachable.
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status | sed -n '1,12p'

say "Automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

say "Swap"
mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
if [ "$mem_kb" -lt $((6 * 1024 * 1024)) ] && ! swapon --show=NAME --noheadings | grep -q .; then
  [ -f /swapfile ] || { fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none; }
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "2 GB swap file on"
else
  echo "Swap not needed or already on: $(swapon --show=NAME,SIZE --noheadings | tr '\n' ' ')"
fi

say "Deploy user '$DEPLOY_USER' (docker group, SSH key only)"
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
home=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$home/.ssh" "$home/dawabag"
auth="$home/.ssh/authorized_keys"
touch "$auth"; chmod 600 "$auth"; chown "$DEPLOY_USER:$DEPLOY_USER" "$auth"
PRIVATE_KEY=""
if [ -n "$DEPLOY_KEY" ]; then
  [[ "$DEPLOY_KEY" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp[0-9]+)\ [A-Za-z0-9+/=]+ ]] || { echo "--deploy-key must be an SSH public key line" >&2; exit 2; }
  grep -qxF "$DEPLOY_KEY" "$auth" || echo "$DEPLOY_KEY" >> "$auth"
  echo "Your deploy key is installed."
elif [ "$NEW_KEY" = true ] || ! grep -q 'dawabag-trial-deploy' "$auth"; then
  # Made here only so you need no tools on your own computer: the private half is printed
  # once for the GitHub secret TRIAL_SSH_KEY and removed; only the public half stays.
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  ssh-keygen -q -t ed25519 -N '' -C "dawabag-trial-deploy $(date +%Y-%m-%d)" -f "$tmp/key"
  cat "$tmp/key.pub" >> "$auth"
  PRIVATE_KEY=$(cat "$tmp/key")
  rm -rf "$tmp"
else
  echo "A deploy key is already installed (use --new-deploy-key for another)."
fi

say "SSH: keys only, no passwords"
cat > /etc/ssh/sshd_config.d/00-dawabag-trial.conf <<'EOF'
# Dawabag trial (deploy/trial/bootstrap-server.sh). First match wins, so this file
# (00-) overrides cloud-init's 50-cloud-init.conf.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t
systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true

if [ -z "$IP" ]; then
  # DigitalOcean metadata first, then a public echo service, then the first address
  IP=$(curl -fsS -m 3 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null \
    || curl -fsS -m 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
fi

line() { printf '%s\n' "────────────────────────────────────────────────────────────────────────"; }
say "Done. Now add these in GitHub → your repository → Settings → Secrets and variables → Actions"
echo "(\"New repository secret\": the name on the left, the value exactly as shown)"
line; echo "TRIAL_SSH_HOST"; line; echo "$IP"
line; echo "TRIAL_SSH_USER   (optional; this is the default)"; line; echo "$DEPLOY_USER"
line; echo "TRIAL_SSH_KNOWN_HOSTS"; line
for f in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub /etc/ssh/ssh_host_rsa_key.pub; do
  [ -f "$f" ] && echo "$IP $(cut -d' ' -f1,2 "$f")"
done
if [ -n "$PRIVATE_KEY" ]; then
  line; echo "TRIAL_SSH_KEY   (copy every line, including BEGIN and END; shown only now)"; line
  printf '%s\n' "$PRIVATE_KEY"
fi
if [ -n "$EMAIL" ]; then
  maker="$(dirname "$0")/make-trial-env.sh"
  if [ ! -f "$maker" ]; then
    maker=$(mktemp)
    curl -fsSL "https://raw.githubusercontent.com/Nootanpune/dawabag14022026/${DAWABAG_REF:-main}/deploy/trial/make-trial-env.sh" -o "$maker"
  fi
  line; echo "TRIAL_ENV   (copy every line; keep it — changing DB_PASSWORD later needs a reset)"; line
  bash "$maker" "${DOMAIN:-$IP}" "$EMAIL"
fi
line
echo "Next: GitHub → Actions → \"Deploy trial server\" → Run workflow (tick \"seed demo\" the first time)."
exit 0
}
