#!/usr/bin/env bash
# shellcheck disable=SC2015  # ok() and no() always succeed, so A && ok || no is safe here
# Self-test of the production deployment kit (Sprint 50) — no server, no secret, no deploy:
#
#   deploy/production/test-kit.sh
#
# 1. make-production-env.sh produces a file whose only gaps are the third-party blanks;
# 2. with dummy third-party values it passes check-env.sh;
# 3. check-env.sh refuses each unsafe change (test keys, demo flags, trial settings, missing or
#    short encryption keys, shared passwords, regions outside India, placeholders …);
# 4. `docker compose config` of the staging stack + production override resolves with it, with
#    APP_ENV=production, release-tagged images and the backup secrets kept away from the API.
# CI runs this (job "production-kit"); everything lives in a temporary directory removed at the end.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0
ok() { echo "  ok   $*"; }
no() { echo "  FAIL $*"; fails=$((fails + 1)); }

"$HERE/make-production-env.sh" --web www.dawabag.test --api api.dawabag.test --email ops@dawabag.test > "$tmp/base.env" 2> "$tmp/instructions.txt" \
  && ok "make-production-env.sh prints a settings file" || no "make-production-env.sh failed"
grep -q 'TOTP_ENC_KEY' "$tmp/instructions.txt" && grep -q 'PRODUCTION_ENV' "$tmp/instructions.txt" \
  && ok "…and tells where to store it and which keys must never be lost" || no "instructions missing"
for k in DB_PASSWORD DB_APP_PASSWORD JWT_ACCESS_SECRET JWT_REFRESH_SECRET TOTP_ENC_KEY HEALTH_ENC_KEY BACKUP_ENC_KEY DOCUMENT_LINK_SECRET HANDOVER_CODE_SECRET; do
  v="$(sed -n "s/^$k=//p" "$tmp/base.env")"
  [[ "$v" =~ ^[0-9a-f]{48,}$ ]] || no "$k is not a fresh random value"
done
ok "every generated secret is long random hex"
"$HERE/make-production-env.sh" --web www.dawabag.test --api api.dawabag.test --email ops@dawabag.test 2>/dev/null > "$tmp/again.env"
[ "$(sed -n 's/^TOTP_ENC_KEY=//p' "$tmp/base.env")" != "$(sed -n 's/^TOTP_ENC_KEY=//p' "$tmp/again.env")" ] \
  && ok "two runs give different secrets" || no "secrets repeat between runs"

"$HERE/check-env.sh" "$tmp/base.env" > "$tmp/out.txt" && no "the unfilled file must fail (third-party blanks)" \
  || { grep -q 'RAZORPAY_KEY_ID' "$tmp/out.txt" && ok "unfilled file refused, naming the blanks"; }
grep -qE '[0-9a-f]{48}' "$tmp/out.txt" && no "check-env.sh printed a secret value" || ok "check-env.sh prints names only"

# Dummy third-party values (never real ones)
sed -e 's|^AWS_ACCESS_KEY_ID=$|AWS_ACCESS_KEY_ID=AKIADUMMYAPI|' -e 's|^AWS_SECRET_ACCESS_KEY=$|AWS_SECRET_ACCESS_KEY=dummy-api-secret|' \
    -e 's|^AWS_S3_BUCKET=$|AWS_S3_BUCKET=dawabag-documents-ci|' -e 's|^AWS_SES_FROM_EMAIL=$|AWS_SES_FROM_EMAIL=noreply@dawabag.test|' \
    -e 's|^BACKUP_S3_BUCKET=$|BACKUP_S3_BUCKET=dawabag-backups-ci|' -e 's|^BACKUP_AWS_ACCESS_KEY_ID=$|BACKUP_AWS_ACCESS_KEY_ID=AKIADUMMYBACKUP|' \
    -e 's|^BACKUP_AWS_SECRET_ACCESS_KEY=$|BACKUP_AWS_SECRET_ACCESS_KEY=dummy-backup-secret|' \
    -e 's|^RAZORPAY_KEY_ID=$|RAZORPAY_KEY_ID=rzp_live_DUMMYCI|' -e 's|^RAZORPAY_KEY_SECRET=$|RAZORPAY_KEY_SECRET=dummy-razorpay|' \
    -e 's|^RAZORPAY_WEBHOOK_SECRET=$|RAZORPAY_WEBHOOK_SECRET=dummy-webhook|' -e 's|^MSG91_AUTH_KEY=$|MSG91_AUTH_KEY=dummy-msg91|' \
    -e 's|^MSG91_TEMPLATE_OTP=$|MSG91_TEMPLATE_OTP=dummy-template|' "$tmp/base.env" > "$tmp/good.env"
"$HERE/check-env.sh" "$tmp/good.env" > "$tmp/out.txt" && ok "filled with dummy values, the file passes" || { cat "$tmp/out.txt"; no "the filled file should pass"; }

# Each change below must be refused: "<description>|<sed expression or appended line>"
refuse() {
  local what="$1" edit="$2"
  if [[ "$edit" == +* ]]; then { cat "$tmp/good.env"; echo "${edit#+}"; } > "$tmp/bad.env"
  else sed -e "$edit" "$tmp/good.env" > "$tmp/bad.env"; fi
  if "$HERE/check-env.sh" "$tmp/bad.env" > "$tmp/out.txt"; then no "not refused: $what"; else ok "refused: $what"; fi
}
refuse "Razorpay test keys"                 's|^RAZORPAY_KEY_ID=.*|RAZORPAY_KEY_ID=rzp_test_DUMMY|'
refuse "PAYMENTS_TEST_MODE with live keys"  '+PAYMENTS_TEST_MODE=true'
refuse "APP_ENV=trial"                      's|^APP_ENV=.*|APP_ENV=trial|'
refuse "DEMO_SEED"                          '+DEMO_SEED=true'
refuse "TRIAL_DEMO_PASSWORD"                '+TRIAL_DEMO_PASSWORD=Dwb-abcd-efgh-jkmn'
refuse "DEMO_PAYMENTS"                      '+DEMO_PAYMENTS=false'
refuse "ALLOW_MISSING_INTEGRATIONS"         '+ALLOW_MISSING_INTEGRATIONS=true'
refuse "a self-hosted object store"         '+S3_ENDPOINT=http://objectstore:9000'
refuse "a test-only provider address"       '+RAZORPAY_BASE_URL=http://127.0.0.1:4890'
refuse "missing TOTP_ENC_KEY"               's|^TOTP_ENC_KEY=.*|TOTP_ENC_KEY=|'
refuse "missing HEALTH_ENC_KEY"             '/^HEALTH_ENC_KEY=/d'
refuse "missing BACKUP_ENC_KEY"             's|^BACKUP_ENC_KEY=.*|BACKUP_ENC_KEY=|'
refuse "a short encryption key"             's|^HEALTH_ENC_KEY=.*|HEALTH_ENC_KEY=abc123|'
refuse "API password = owner password"      "s|^DB_APP_PASSWORD=.*|DB_APP_PASSWORD=$(sed -n 's/^DB_PASSWORD=//p' "$tmp/good.env")|"
refuse "a change-me value"                  's|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=change-me-at-least-32-random-characters|'
refuse "an example address"                 's|^AWS_SES_FROM_EMAIL=.*|AWS_SES_FROM_EMAIL=noreply@example.com|'
refuse "documents outside Mumbai"           's|^AWS_REGION=.*|AWS_REGION=us-east-1|'
refuse "backups outside India"              's|^BACKUP_AWS_REGION=.*|BACKUP_AWS_REGION=eu-west-1|'
refuse "backups in the documents bucket"    's|^BACKUP_S3_BUCKET=.*|BACKUP_S3_BUCKET=dawabag-documents-ci|'
refuse "backups with the API's keys"        's|^BACKUP_AWS_ACCESS_KEY_ID=.*|BACKUP_AWS_ACCESS_KEY_ID=AKIADUMMYAPI|'
refuse "a pasted shell prompt line"         '+root@server:~# '
refuse "a key set twice"                    '+QUEUE_PREFIX=other'
refuse "the trial's sslip.io names"         's|^WEB_DOMAIN=.*|WEB_DOMAIN=203-0-113-10.sslip.io|'
refuse "Caddy's test certificates"          '+CADDY_GLOBAL_OPTIONS=local_certs'
refuse "Agora without its certificate"      's|^AGORA_APP_ID=.*|AGORA_APP_ID=abc|'
refuse "half the e-invoice keys"            's|^IRP_CLIENT_ID=.*|IRP_CLIENT_ID=abc|'
# …and a declared dry run with test keys is accepted (with a warning)
sed -e 's|^RAZORPAY_KEY_ID=.*|RAZORPAY_KEY_ID=rzp_test_DUMMY|' "$tmp/good.env" > "$tmp/dry.env"; echo 'PAYMENTS_TEST_MODE=true' >> "$tmp/dry.env"
if "$HERE/check-env.sh" "$tmp/dry.env" > "$tmp/out.txt" && grep -q 'dry run' "$tmp/out.txt"; then ok "a declared dry run (PAYMENTS_TEST_MODE=true + test keys) passes with a warning"; else no "dry run should pass with a warning"; fi
printf '%s\n' "$(cat "$tmp/good.env")" | "$HERE/check-env.sh" - >/dev/null && ok "reads standard input too" || no "standard input"

# The compose files resolve with the production override
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  { cat "$tmp/good.env"; echo "DAWABAG_RELEASE=ci0000"; } > "$tmp/production.env"
  if STACK_ENV_FILE="$tmp/production.env" docker compose -f "$ROOT/deploy/staging/compose.yml" -f "$HERE/compose.production.yml" \
       --env-file "$tmp/production.env" config --format json > "$tmp/config.json" 2> "$tmp/config.err"; then
    ok "docker compose config (staging stack + production override) resolves"
    node - "$tmp/config.json" <<'JS' || fails=$((fails + 1))
const c = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
const s = c.services, bad = [];
const want = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) bad.push(msg); };
want(c.name === 'dawabag-production', 'project name dawabag-production (own volumes)');
want(s.api.environment.APP_ENV === 'production' && s.migrate.environment.APP_ENV === 'production', 'APP_ENV=production forced for the API and migrations');
want(s.api.environment.DB_USER === 'dawabag_api' && s.api.environment.DB_PASSWORD !== s.migrate.environment.DB_PASSWORD, 'the API uses its own restricted login, not the owner\'s password');
want(s.api.environment.QUEUE_PREFIX === 'dawabag-production', 'QUEUE_PREFIX set');
want(s.api.image === 'dawabag-production-api:ci0000' && s.web.image === 'dawabag-production-web:ci0000', 'images tagged with the release');
want(!s.api.environment.BACKUP_ENC_KEY && !s.api.environment.BACKUP_AWS_SECRET_ACCESS_KEY, 'backup secrets kept away from the API');
want(/^[0-9a-f]{64}$/.test(s.backup.environment.BACKUP_ENC_KEY) && s.backup.environment.AWS_REGION === 'ap-south-2', 'backups encrypted, to ap-south-2');
want(s.caddy.environment.REDIRECT_DOMAINS === 'dawabag.test', 'the bare domain redirects to the website');
want(!s.objectstore, 'no self-hosted object store');
want(JSON.stringify(s.caddy.ports).includes('443') && !s.postgres.ports && !s.redis.ports, 'only Caddy publishes ports');
process.exit(bad.length ? 1 : 0);
JS
  else cat "$tmp/config.err"; no "docker compose config failed"; fi
else
  echo "  skip docker compose config — docker compose not installed here"
fi

[ "$fails" = 0 ] && echo "Production kit self-test passed" || { echo "Production kit self-test FAILED ($fails)"; exit 1; }
