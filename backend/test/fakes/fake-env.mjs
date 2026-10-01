// Prints the environment for running the API and the smoke tests against throwaway
// fake providers (MSG91, Google OAuth + FCM, Shiprocket, the GST IRP, Razorpay) on one local
// port. Fresh RSA keys stand in for the Firebase service account and the IRP's key
// pair. Nothing is written to disk.
//
//   eval "$(node test/fakes/fake-env.mjs)"   # then start the API and run the smoke tests in this shell
import crypto from 'crypto';

const port = process.env.FAKE_PROVIDERS_PORT || '4890';
const base = `http://127.0.0.1:${port}`;
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const account = {
  type: 'service_account', project_id: 'dawabag-fake', client_email: 'push@dawabag-fake.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};
const irp = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const env = {
  FAKE_PROVIDERS_PORT: port,
  MSG91_AUTH_KEY: 'fake-msg91-key', MSG91_BASE_URL: base,
  FCM_SERVICE_ACCOUNT_JSON: Buffer.from(JSON.stringify(account)).toString('base64'),
  GOOGLE_OAUTH_TOKEN_URL: `${base}/token`, FCM_BASE_URL: base,
  SHIPROCKET_EMAIL: 'api@dawabag.test', SHIPROCKET_PASSWORD: 'fake-password', SHIPROCKET_BASE_URL: base,
  SHIPROCKET_WEBHOOK_TOKEN: crypto.randomBytes(16).toString('hex'),
  IRP_BASE_URL: base, IRP_CLIENT_ID: 'fake-irp-client', IRP_CLIENT_SECRET: 'fake-irp-secret',
  IRP_USERNAME: 'dawabag_api', IRP_PASSWORD: 'fake-irp-password',
  IRP_PUBLIC_KEY: irp.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
  RAZORPAY_KEY_ID: 'rzp_test_fake', RAZORPAY_KEY_SECRET: crypto.randomBytes(12).toString('hex'),
  RAZORPAY_WEBHOOK_SECRET: crypto.randomBytes(12).toString('hex'), RAZORPAY_BASE_URL: base,
  FAKE_IRP_PRIVATE_KEY: irp.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),   // the fake's half only
};
for (const [k, v] of Object.entries(env)) console.log(`export ${k}='${v}'`);
