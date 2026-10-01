// Prints the environment for running the API and the Sprint 8 smoke test against
// throwaway fake providers (MSG91, Google OAuth + FCM, Shiprocket) on one local port.
// A fresh RSA key stands in for the Firebase service account. Nothing is written to disk.
//
//   eval "$(node test/sprint8/fake-env.mjs)"   # then start the API and run test/sprint8.smoke.mjs in this shell
import crypto from 'crypto';

const port = process.env.FAKE_PROVIDERS_PORT || '4890';
const base = `http://127.0.0.1:${port}`;
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const account = {
  type: 'service_account', project_id: 'dawabag-fake', client_email: 'push@dawabag-fake.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};
const env = {
  FAKE_PROVIDERS_PORT: port,
  MSG91_AUTH_KEY: 'fake-msg91-key', MSG91_BASE_URL: base,
  FCM_SERVICE_ACCOUNT_JSON: Buffer.from(JSON.stringify(account)).toString('base64'),
  GOOGLE_OAUTH_TOKEN_URL: `${base}/token`, FCM_BASE_URL: base,
  SHIPROCKET_EMAIL: 'api@dawabag.test', SHIPROCKET_PASSWORD: 'fake-password', SHIPROCKET_BASE_URL: base,
  SHIPROCKET_WEBHOOK_TOKEN: crypto.randomBytes(16).toString('hex'),
};
for (const [k, v] of Object.entries(env)) console.log(`export ${k}='${v}'`);
