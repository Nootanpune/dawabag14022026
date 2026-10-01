# Dawabag local / CI environment — source it, don't run it:
#   . scripts/dev-env.sh && scripts/dev-up.sh && (cd backend && npm run test:smoke)
# Throwaway values for a development machine or CI only. Every provider points at
# the in-process fakes (backend/test/fakes); nothing real is called. Production
# configuration lives in the deployment's secret store, never here.
export NODE_ENV="${NODE_ENV:-development}"
export PORT="${PORT:-4000}"
export DB_HOST="${DB_HOST:-127.0.0.1}" DB_PORT="${DB_PORT:-5432}"
export DB_NAME="${DB_NAME:-dawabag}" DB_USER="${DB_USER:-dawabag_user}" DB_PASSWORD="${DB_PASSWORD:-dawabag_dev_only}"
export DATABASE_URL="${DATABASE_URL:-postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379}"
export API_URL="${API_URL:-http://localhost:$PORT}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3000}"
export AWS_REGION="${AWS_REGION:-ap-south-1}" AWS_EC2_METADATA_DISABLED=true
export BCRYPT_ROUNDS="${BCRYPT_ROUNDS:-4}"
# Fresh per shell: the API and the tests in this shell share them
if [ -z "${JWT_ACCESS_SECRET:-}" ]; then
  JWT_ACCESS_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  JWT_REFRESH_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  export JWT_ACCESS_SECRET JWT_REFRESH_SECRET
fi
# Generous limits: the smoke suites sign in and verify many times
export AUTH_RATE_LIMIT_MAX="${AUTH_RATE_LIMIT_MAX:-5000}" RATE_LIMIT_MAX="${RATE_LIMIT_MAX:-50000}" VERIFY_RATE_LIMIT_MAX="${VERIFY_RATE_LIMIT_MAX:-1000}"
export DISABLE_SCHEDULER="${DISABLE_SCHEDULER:-true}"
_dawabag_root="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
if [ -z "${FAKE_PROVIDERS_PORT:-}" ]; then
  eval "$(node "$_dawabag_root/backend/test/fakes/fake-env.mjs")"
fi
unset _dawabag_root
