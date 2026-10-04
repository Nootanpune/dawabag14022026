#!/usr/bin/env bash
# Dawabag PRODUCTION server — one-time preparation of a fresh Ubuntu 24.04 machine in an
# Indian region (docs/PRODUCTION.md, step 3). Run once as root; safe to run again.
#
#   (on the new server, logged in as root with your own SSH key)
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/<tag>/deploy/production/bootstrap-server.sh -o bootstrap.sh
#   less bootstrap.sh            # read it first
#   bash bootstrap.sh --admin-user ops
#
# What it does (each step checks first, so a second run changes nothing):
#   • Docker Engine + compose plugin from Docker's apt repository; container logs go to the
#     system journal, kept 200 days and at most JOURNAL_MAX (CERT-In: 180 days of logs, C-43)
#   • firewall: only SSH 22, HTTP 80, HTTPS 443 open; fail2ban bans repeated SSH failures
#   • automatic SECURITY updates, with a reboot when one needs it at 03:30 IST (after the
#     02:30 IST backup) — --no-auto-reboot to reboot by hand instead
#   • a swap file (2 GB, or 4 GB under 6 GB of memory) for image builds
#   • time: system clock in UTC, synchronised (systemd-timesyncd); operators see IST too
#   • users: `dawabag` (deploys from GitHub Actions; docker group; SSH key only; no sudo) and
#     an admin user (--admin-user, default `dawabagops`; sudo; your SSH key(s) copied from root)
#   • SSH: keys only, no passwords, NO root login (once the admin user has a key), 3 tries
#
# At the end it prints what to paste into GitHub → Settings → Environments → production →
# Environment secrets: PRODUCTION_SSH_HOST, PRODUCTION_SSH_KNOWN_HOSTS (this server's host
# keys) and PRODUCTION_SSH_KEY (a new deploy key, printed once, never kept here). Nothing
# secret is written to this server's disk; the deploy workflow writes the settings file.
#
# Options:
#   --admin-user NAME      the human admin account (default dawabagops)
#   --admin-key 'ssh-ed25519 AAAA… you@laptop'   add this key for the admin user (else root's keys are copied)
#   --deploy-key 'ssh-ed25519 AAAA…'             use your own deploy public key instead of a new one
#   --new-deploy-key       make another deploy key even if one is installed
#   --no-auto-reboot       install security updates but never reboot by itself
#   --ip ADDRESS           the server's public IPv4 (found automatically otherwise)
#   --journal-max SIZE     cap for kept logs (default 20G)
set -euo pipefail
# Braces: bash reads the whole script before running any of it (safe with curl | bash too)
{
ADMIN_USER=dawabagops ADMIN_KEY="" DEPLOY_KEY="" NEW_KEY=false AUTO_REBOOT=true IP="" JOURNAL_MAX=20G
while [ $# -gt 0 ]; do
  case "$1" in
    --admin-user) ADMIN_USER="${2:?}"; shift 2 ;;
    --admin-key) ADMIN_KEY="${2:?}"; shift 2 ;;
    --deploy-key) DEPLOY_KEY="${2:?}"; shift 2 ;;
    --new-deploy-key) NEW_KEY=true; shift ;;
    --no-auto-reboot) AUTO_REBOOT=false; shift ;;
    --ip) IP="${2:?}"; shift 2 ;;
    --journal-max) JOURNAL_MAX="${2:?}"; shift 2 ;;
    -h|--help) sed -n '2,36p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Run as root (sudo -i first)." >&2; exit 1; }
# shellcheck source=/dev/null
. /etc/os-release
[ "${ID:-}" = ubuntu ] || { echo "This script is for Ubuntu (found ${ID:-unknown})." >&2; exit 1; }
[ "${VERSION_ID:-}" = 24.04 ] || echo "Note: written for Ubuntu 24.04; found ${VERSION_ID:-?}. Continuing."
[[ "$ADMIN_USER" =~ ^[a-z][a-z0-9_-]{2,30}$ ]] || { echo "--admin-user: 3–31 lower-case letters, digits, - or _" >&2; exit 2; }
[ "$ADMIN_USER" != dawabag ] || { echo "--admin-user must differ from the deploy user 'dawabag'" >&2; exit 2; }
[[ "$JOURNAL_MAX" =~ ^[0-9]+[MG]$ ]] || { echo "--journal-max like 20G or 8000M" >&2; exit 2; }
key_line() { [[ "$1" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp[0-9]+|sk-ssh-ed25519@openssh.com)\ [A-Za-z0-9+/=]+ ]]; }
[ -z "$ADMIN_KEY" ] || key_line "$ADMIN_KEY" || { echo "--admin-key must be an SSH public key line" >&2; exit 2; }
[ -z "$DEPLOY_KEY" ] || key_line "$DEPLOY_KEY" || { echo "--deploy-key must be an SSH public key line" >&2; exit 2; }
export DEBIAN_FRONTEND=noninteractive
DEPLOY_USER=dawabag

say "Base packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg rsync ufw fail2ban unattended-upgrades openssl systemd-timesyncd >/dev/null

say "Time: UTC system clock, synchronised; IST shown to operators"
# The containers and the database work in UTC; the application shows IST itself
timedatectl set-timezone Etc/UTC
timedatectl set-ntp true || true
systemctl enable --now systemd-timesyncd >/dev/null 2>&1 || true
cat > /etc/profile.d/dawabag-time.sh <<'EOF'
# Dawabag (deploy/production/bootstrap-server.sh): the clock is UTC; show IST next to it
alias ist='TZ=Asia/Kolkata date "+%F %T IST"'
case $- in *i*) echo "Server time $(date -u '+%F %T UTC') = $(TZ=Asia/Kolkata date '+%F %T IST')";; esac
EOF
timedatectl | sed -n '1,6p'

say "Logs: system journal kept 200 days (at most $JOURNAL_MAX) — CERT-In 180 days (C-43)"
install -d /etc/systemd/journald.conf.d /var/log/journal
cat > /etc/systemd/journald.conf.d/00-dawabag.conf <<EOF
# Dawabag production (bootstrap-server.sh). Container logs come here (Docker's journald
# driver). CERT-In asks for 180 days; size-capped so logs can never fill the disk.
[Journal]
Storage=persistent
Compress=yes
SystemMaxUse=$JOURNAL_MAX
MaxRetentionSec=200day
EOF
systemctl restart systemd-journald

say "Docker Engine and compose plugin (Docker's apt repository)"
if ! docker compose version >/dev/null 2>&1; then
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
# Container logs to the journal (rotated by journald above). `docker compose logs` still works.
want_daemon='{
  "log-driver": "journald",
  "log-opts": { "tag": "{{.Name}}" },
  "live-restore": true
}'
if [ "$(cat /etc/docker/daemon.json 2>/dev/null)" != "$want_daemon" ]; then
  printf '%s\n' "$want_daemon" > /etc/docker/daemon.json
  systemctl restart docker
  echo "Docker logging set to journald (containers created before this keep their old driver until recreated)"
fi
systemctl enable --now docker >/dev/null 2>&1
docker compose version

say "Firewall: only SSH (22), HTTP (80) and HTTPS (443)"
# Docker publishes only Caddy's 80 and 443 (deploy/staging/compose.yml); PostgreSQL and Redis
# have no published port. Note: ports Docker publishes bypass ufw — never add `ports:` to them.
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow 22/tcp >/dev/null   # brute force is handled by fail2ban below (ufw limit trips on deploy bursts)
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status | sed -n '1,12p'

say "fail2ban: ban an address for 1 hour after 5 failed SSH logins in 10 minutes"
cat > /etc/fail2ban/jail.d/dawabag-sshd.local <<'EOF'
# Dawabag production (bootstrap-server.sh)
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
systemctl enable fail2ban >/dev/null 2>&1
systemctl restart fail2ban
fail2ban-client status sshd 2>/dev/null | sed -n '1,4p' || true

say "Automatic security updates$([ "$AUTO_REBOOT" = true ] && echo ', reboot at 03:30 IST when needed')"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
# Security pocket only (Ubuntu's default origins); 22:00 UTC = 03:30 IST, after the 02:30 IST backup
cat > /etc/apt/apt.conf.d/52dawabag-unattended <<EOF
// Dawabag production (bootstrap-server.sh)
Unattended-Upgrade::Automatic-Reboot "$AUTO_REBOOT";
Unattended-Upgrade::Automatic-Reboot-Time "22:00";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
EOF
systemctl enable --now unattended-upgrades >/dev/null 2>&1 || true

say "Swap"
mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
swap_gb=2; [ "$mem_kb" -lt $((6 * 1024 * 1024)) ] && swap_gb=4
if ! swapon --show=NAME --noheadings | grep -q .; then
  [ -f /swapfile ] || { fallocate -l "${swap_gb}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((swap_gb * 1024)) status=none; }
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "${swap_gb} GB swap file on"
else
  echo "Swap already on: $(swapon --show=NAME,SIZE --noheadings | tr '\n' ' ')"
fi
sysctl -q -w vm.swappiness=10
echo 'vm.swappiness=10' > /etc/sysctl.d/60-dawabag.conf

say "Deploy user '$DEPLOY_USER' (docker group, SSH key only, no sudo)"
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
passwd -l "$DEPLOY_USER" >/dev/null 2>&1 || true
home=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$home/.ssh" "$home/dawabag"
auth="$home/.ssh/authorized_keys"
touch "$auth"; chmod 600 "$auth"; chown "$DEPLOY_USER:$DEPLOY_USER" "$auth"
PRIVATE_KEY=""
if [ -n "$DEPLOY_KEY" ]; then
  grep -qxF "$DEPLOY_KEY" "$auth" || echo "$DEPLOY_KEY" >> "$auth"
  echo "Your deploy key is installed."
elif [ "$NEW_KEY" = true ] || ! grep -q 'dawabag-production-deploy' "$auth"; then
  # The private half is printed once for the GitHub secret PRODUCTION_SSH_KEY and removed
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  ssh-keygen -q -t ed25519 -N '' -C "dawabag-production-deploy $(date +%Y-%m-%d)" -f "$tmp/key"
  cat "$tmp/key.pub" >> "$auth"
  PRIVATE_KEY=$(cat "$tmp/key")
  rm -rf "$tmp"
else
  echo "A deploy key is already installed (use --new-deploy-key for another)."
fi

say "Admin user '$ADMIN_USER' (sudo, SSH key only)"
id "$ADMIN_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash -G sudo "$ADMIN_USER"
usermod -aG sudo "$ADMIN_USER"
passwd -l "$ADMIN_USER" >/dev/null 2>&1 || true   # no password: key login only
ahome=$(getent passwd "$ADMIN_USER" | cut -d: -f6)
install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "$ahome/.ssh"
aauth="$ahome/.ssh/authorized_keys"
touch "$aauth"; chmod 600 "$aauth"; chown "$ADMIN_USER:$ADMIN_USER" "$aauth"
if [ -n "$ADMIN_KEY" ]; then grep -qxF "$ADMIN_KEY" "$aauth" || echo "$ADMIN_KEY" >> "$aauth"; fi
if [ -s /root/.ssh/authorized_keys ]; then
  while IFS= read -r k; do
    key_line "$k" || continue
    grep -qxF "$k" "$aauth" || echo "$k" >> "$aauth"
  done < /root/.ssh/authorized_keys
fi
# Key-only account without a password: sudo must not ask for one
echo "$ADMIN_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-dawabag-$ADMIN_USER"
chmod 440 "/etc/sudoers.d/90-dawabag-$ADMIN_USER"
visudo -cq
ADMIN_HAS_KEY=false; grep -qE '^(ssh-|ecdsa-|sk-)' "$aauth" && ADMIN_HAS_KEY=true

say "SSH: keys only, no passwords$([ "$ADMIN_HAS_KEY" = true ] && echo ', no root login')"
root_login=no
if [ "$ADMIN_HAS_KEY" != true ]; then
  root_login=prohibit-password
  echo "WARNING: $ADMIN_USER has no SSH key yet, so root login (key only) stays on to avoid locking you out."
  echo "         Run again with --admin-key '<your public key>' to switch root login off."
fi
cat > /etc/ssh/sshd_config.d/00-dawabag-production.conf <<EOF
# Dawabag production (deploy/production/bootstrap-server.sh). First match wins, so this
# file (00-) overrides cloud-init's 50-cloud-init.conf.
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin $root_login
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
AllowAgentForwarding no
EOF
sshd -t
systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true

if [ -z "$IP" ]; then
  # Cloud metadata (DigitalOcean, then AWS IMDSv2), then a public echo service, then the first address
  IP=$(curl -fsS -m 3 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null \
    || { t=$(curl -fsS -m 3 -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token 2>/dev/null) \
         && curl -fsS -m 3 -H "X-aws-ec2-metadata-token: $t" http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null; } \
    || curl -fsS -m 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
fi

line() { printf '%s\n' "────────────────────────────────────────────────────────────────────────"; }
say "Done. Add these in GitHub → the repository → Settings → Environments → production → Environment secrets"
echo "(the name on the left, the value exactly as shown; then delete this terminal's scrollback)"
line; echo "PRODUCTION_SSH_HOST"; line; echo "$IP"
line; echo "PRODUCTION_SSH_KNOWN_HOSTS   (this server's host keys — compare with the provider's console if unsure)"; line
for f in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub /etc/ssh/ssh_host_rsa_key.pub; do
  [ -f "$f" ] && echo "$IP $(cut -d' ' -f1,2 "$f")"
done
line; echo "Host key fingerprints (to compare on first manual login)"; line
for f in /etc/ssh/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ecdsa_key.pub; do [ -f "$f" ] && ssh-keygen -lf "$f"; done
if [ -n "$PRIVATE_KEY" ]; then
  line; echo "PRODUCTION_SSH_KEY   (copy every line, including BEGIN and END; shown only now)"; line
  printf '%s\n' "$PRIVATE_KEY"
fi
line
echo "Admin login from now on:  ssh $ADMIN_USER@$IP   (root login is $([ "$root_login" = no ] && echo OFF || echo 'still on, key only'))"
echo "Next: docs/PRODUCTION.md step 4 — make PRODUCTION_ENV, then Actions → \"Deploy production\"."
exit 0
}
