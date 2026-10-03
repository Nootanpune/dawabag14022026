# Dawabag live trial — from nothing to a working website and Android app

This guide puts the whole Dawabag pharmacy (website, Android app, database, file
store) on **one small rented server** so you can try every part of it yourself, with
demo medicines and a ready login for every role. You do not need a domain name and
you do not need to install anything on your own computer: everything is done in the
web browser (DigitalOcean, GitHub, Razorpay).

**Time:** about 45 minutes the first time, most of it waiting.
**Cost:** about **US$24 a month** (≈ ₹2,000) for the server, billed by the hour —
destroy it when you are done and billing stops. Razorpay test mode is free.

> The trial is a **demonstration**. Every page shows a yellow "Trial / demo site" strip,
> the licence numbers in the footer say "DEMO — not a real licence", payments are
> Razorpay **test** payments (no real money), and nothing is delivered. Never enter a
> real patient's details or prescription. The data is throwaway.

## What you need

- A **DigitalOcean** account (with a card on file).
- Admin access to the GitHub repository **Nootanpune/dawabag14022026**, with this
  guide's files on the **main** branch (the "Run workflow" button only appears for
  workflows on the main branch).
- Your **e-mail address** (for the free HTTPS certificates).
- A **Razorpay** account (test mode is enough; no KYC needed for test mode).
- An **Android phone** to try the app.

---

## Step 1 — Create the server (DigitalOcean, Bangalore)

1. Log in at **cloud.digitalocean.com** → green **Create** button (top right) → **Droplets**.
2. **Region:** *Bangalore* (datacenter **BLR1**). Data stays in India.
3. **Image:** *Ubuntu* → **24.04 (LTS) x64**.
4. **Size:** *Basic* → *Regular* (SSD) → **US$24/month — 4 GB RAM / 2 CPUs / 80 GB disk**.
   (2 GB is too small: building the website needs the memory.)
5. **Authentication:** choose **Password** and set a long root password (store it in
   your password manager). If you already use SSH keys, *SSH Key* works too.
6. **Hostname:** `dawabag-trial`. Leave everything else as it is (no paid add-ons needed).
7. Click **Create Droplet** and wait a minute until it shows a green dot.
8. **The server's IP address** is the number shown next to the droplet name (for
   example `203.0.113.10`, "ipv4"). Click it to copy. You will need it below.

*Any Ubuntu 24.04 machine with 4 GB of memory and a public IP works the same way
(AWS Lightsail Mumbai, another provider); only these clicks differ.*

## Step 2 — Prepare the server (one command)

1. In DigitalOcean open the droplet → **Access** (left menu) → **Launch Droplet Console**.
   A black terminal window opens in your browser, already logged in as `root`.
2. Copy this line, change `you@example.com` to **your e-mail**, paste it into the
   console (right-click → Paste, or Ctrl+Shift+V) and press **Enter**:

   ```
   curl -fsSL https://raw.githubusercontent.com/Nootanpune/dawabag14022026/main/deploy/trial/bootstrap-server.sh | bash -s -- --email you@example.com
   ```

3. Wait 3–5 minutes. It installs Docker, switches on the firewall (only web and SSH
   open), automatic security updates and swap memory, creates a `dawabag` user for
   GitHub to deploy as, and turns off password logins over SSH (the browser console
   keeps working).
4. At the end it prints **four blocks** between lines, each with a name on top:
   `TRIAL_SSH_HOST`, `TRIAL_SSH_KNOWN_HOSTS`, `TRIAL_SSH_KEY` and `TRIAL_ENV`.
   **Leave this window open** — you copy them into GitHub in the next step.
   `TRIAL_SSH_KEY` is shown only this once (run the command again with
   `--new-deploy-key` if you lose it).

## Step 3 — Give GitHub the keys (repository secrets)

In GitHub open the repository → **Settings** → **Secrets and variables** → **Actions**
→ tab **Secrets** → **New repository secret**. Create each one: the **Name** exactly as
written, the **Secret** = the block printed under that name (all of its lines).

| Name | What to paste |
| --- | --- |
| `TRIAL_SSH_HOST` | the server's IP address |
| `TRIAL_SSH_KNOWN_HOSTS` | the lines starting with the IP and `ssh-ed25519` / `ecdsa-…` / `ssh-rsa` |
| `TRIAL_SSH_KEY` | everything from `-----BEGIN OPENSSH PRIVATE KEY-----` to `-----END OPENSSH PRIVATE KEY-----` |
| `TRIAL_ENV` | the whole settings block (starts with `# Dawabag TRIAL server settings`) — **after** adding your Razorpay test keys, see below |

`TRIAL_SSH_USER` is optional (it is `dawabag` unless you changed it).

**Keep a copy of `TRIAL_ENV`** in your password manager: it contains the demo
password (`TRIAL_DEMO_PASSWORD=…`) you will log in with, and GitHub never shows a
secret again once saved. If you ever generate a new one, also tick *reset data* on the
next deploy (the database keeps the password it was created with).

### The API's own database password (new in Sprint 41 — nothing to do for an existing trial)

The website's server (the API) now connects to the database with its **own, restricted
login**, so it cannot switch off the protections of the pharmacy registers. A `TRIAL_ENV`
made from now on contains a line `DB_APP_PASSWORD=…` for it. **If your `TRIAL_ENV` secret
was made earlier, you do not have to change anything**: the server works out that password
from your `DB_PASSWORD` by itself, and the deploy log shows a note saying so.
If you prefer to set it yourself (optional):

1. On any computer with a terminal, run `openssl rand -hex 24` (or take any 48 random
   letters and digits from your password manager).
2. GitHub → Settings → Secrets and variables → Actions → `TRIAL_ENV` → **Update** —
   paste your saved copy of the whole block **plus one new line** at the end:
   `DB_APP_PASSWORD=<the 48 characters>` (it must differ from the `DB_PASSWORD=` line).
3. Run the workflow (no reset needed). The server changes the API's password before
   the API starts. Update your saved copy of `TRIAL_ENV` too.

### Two-step sign-in key (new in Sprint 42 — nothing to do for an existing trial)

Staff and partner logins can now sign in with a code from an authenticator app on their
phone as well as the password. The server encrypts each person's app key with
`TOTP_ENC_KEY`. A `TRIAL_ENV` made from now on contains that line. **If your `TRIAL_ENV`
was made earlier, change nothing**: the server works it out from your `DB_PASSWORD` by
itself, the same on every deploy. Do not add or change `TOTP_ENC_KEY` later while people
use two-step sign-in — their apps would stop being accepted (they would sign in with a
recovery code, or the super-admin resets them under Admin → Two-step sign-in).

### Razorpay test keys (so checkout and consultation fees can be paid with test money)

*Optional.* Until these keys are added, the trial shows a **demo payment** instead:
"Demo payment — no money moves". It looks like Razorpay's window: choose UPI, Card,
Netbanking or Wallet, and that method's own step opens (UPI id or a demo QR picture; a
read-only test card and a demo bank OTP; a demo bank page; a wallet). The last screen has
**Approve / Submit / Success** and **Decline / Fail / Failure** buttons. Approving marks
the order paid exactly as a real payment would (pharmacist check, packing, invoice), and
it is recorded as a demo payment. No real card can be typed in, and nothing is sent to a
bank or wallet. To hide it, add `DEMO_PAYMENTS=false` to `TRIAL_ENV`. A real (production) server
refuses this setting and never offers the demo. Once the keys below are added, "Pay
securely" opens Razorpay's own payment window instead.

1. Log in at **dashboard.razorpay.com**. Switch the toggle at the top to **Test Mode**.
2. **Account & Settings** → **API Keys** → **Generate Test Key**. Copy the
   **Key Id** (starts with `rzp_test_`) and the **Key Secret** (shown once).
3. **Account & Settings** → **Webhooks** → **+ Add New Webhook**:
   - **Webhook URL:** `https://api.<your-ip-with-dashes>.sslip.io/api/v1/payments/webhook`
     — for IP `203.0.113.10` that is `https://api.203-0-113-10.sslip.io/api/v1/payments/webhook`
     (the `API_DOMAIN=` line in your `TRIAL_ENV` shows it).
   - **Secret:** make up a long random word (e.g. 30 letters and digits) and note it.
   - **Active events:** tick `payment.captured`, `payment.failed`, `refund.created`,
     `refund.processed`, `refund.failed`, and for automatic refill payments also
     `token.confirmed`, `token.rejected`, `token.cancelled`, `token.paused`.
   - **Create Webhook.**
4. In the `TRIAL_ENV` text (before saving the secret), fill in the three lines:

   ```
   RAZORPAY_KEY_ID=rzp_test_…
   RAZORPAY_KEY_SECRET=…the key secret…
   RAZORPAY_WEBHOOK_SECRET=…the webhook secret you made up…
   ```

   Only `rzp_test_` keys are accepted; the server refuses live keys in a trial.

*Optional:* tab **Variables** → **New repository variable** `TRIAL_AUTODEPLOY` = `true`
makes every push to the trial branch redeploy automatically. Without it you deploy
by clicking (next step).

## Step 4 — Deploy (one click)

1. GitHub → **Actions** → **Deploy trial server** (left list) → **Run workflow**
   (right) → branch **main** → tick **seed demo** (first time) → keep
   **build apk** ticked → **Run workflow**.
2. Wait. The first run takes **15–25 minutes** (it builds everything on the server);
   later runs are faster. Two jobs run: **deploy** (the server) and **android** (the app).
3. When it turns green, open the run: the summary shows your addresses, e.g.
   - Website: `https://203-0-113-10.sslip.io`
   - App server: `https://api.203-0-113-10.sslip.io`

If it fails, open the red step: it says what is wrong (for example a missing secret).
Fix it and click **Re-run all jobs**.

## Step 5 — Try it

### Website

Open the website address. Sign in (top right) with a **mobile number** below and the
**password** from the `TRIAL_DEMO_PASSWORD=` line of your `TRIAL_ENV`:

| Mobile | Who | Try |
| --- | --- | --- |
| 9000090001 | Customer | Search, cart, upload a prescription, checkout, pay with test money, orders, consult a doctor |
| 9000090002 | Retailer (B2B, KYC approved) | Trade prices (PTR), credit bills |
| 9000090003 | Pharmacist (prescriptions) | Verify prescriptions, approve product text and photos |
| 9000090004 | Packer | Pack and dispatch orders |
| 9000090005 | Delivery rider | Run sheet, delivery codes |
| 9000090006 | Admin (super admin) | Settings, catalogue, users, reports, licences |
| 9000090007 | Doctor (verified) | Slots, consultations, e-prescriptions |
| 9000090008 | Partner pharmacy owner | Partner portal: listings, stock, orders |

The demo customer has a saved address in Nashik (PIN 422005). Delivery is set up for
Nashik PIN codes 422001, 422002, 422003, 422005, 422006, 422007, 422009 and 422011
(₹49 delivery, free from ₹499). There are 42 demo medicines by generic name in eight
categories, with stock, drawn "DEMO PACK" photos, one Schedule H1 medicine (Cefixime)
and prescription-only medicines that ask for a prescription at checkout.

**Test payment:** at Razorpay's payment window choose **UPI** and enter
`success@razorpay` (or `failure@razorpay` to see a failed payment), or pay by card
with **5267 3181 8797 5449** (Mastercard) or **4111 1111 1111 1111** (Visa), any future
expiry date, any CVV, then press **Success** on Razorpay's test bank page.

### Android app

1. On your phone open GitHub (browser, logged in) → the repository → **Actions** →
   the green **Deploy trial server** run → scroll to **Artifacts** →
   **dawabag-trial-apk** (downloads a .zip).
2. Open the downloaded zip in **Files** and extract `app-debug.apk`; tap it.
3. Android asks to allow installing from this source: **Settings → Allow from this
   source** (for Chrome or Files), go back, **Install**. (Play Protect may warn that
   the app is unknown: choose *Install anyway* — it is your own test build.)
4. Open **Dawabag**, sign in with the same mobile numbers and password.

The app built by this workflow already points at your trial server. (The normal CI
build uses the repository variable `MOBILE_API_URL`; for the trial that would be
`https://api.<your-ip-with-dashes>.sslip.io` — without `/api/v1`, the app adds it.)
The artifact is kept for 14 days; run the workflow again for a fresh one.

## Step 6 — What works in the trial and what does not

| Works | Does not work (on purpose) |
| --- | --- |
| Website and Android app over HTTPS, every role's screens | **Real money**: only Razorpay test payments. Without the three Razorpay lines, checkout and consultation fees use the labelled **demo payment** (no money moves) |
| Catalogue, search, cart, delivery charge, prescriptions (upload, pharmacist check), packing, dispatch to the demo rider, partner orders, doctor slots and e-prescriptions | **SMS / OTP**: no SMS provider (MSG91) is connected, so **new sign-ups and OTP logins do not work** — use the demo logins (password sign-in) |
| Files (product photos, prescriptions, KYC documents) stored in the server's own encrypted file store, opened by short-lived signed links | **E-mail, push notifications, courier booking, GST e-invoicing, video calls**: not connected; the screens show them as unavailable |
| Nightly encrypted database backup into the same file store | **Legal details are placeholders** ("DEMO — not a real licence"); prices, GST rates and schedules are demo values |
| Admin settings, reports, invoices (marked with the demo details) | **Real customers**: the trial must not be used for real orders or patients |

## Step 7 — Update, reset or tear down

- **Update to the latest code:** Actions → Deploy trial server → Run workflow
  (leave *seed demo* unticked; ticking it again is harmless — it refreshes the demo data).
- **Start again with clean demo data:** Run workflow with **reset data** and **seed demo**
  both ticked. This deletes every order, account and file on the trial server.
- **See what is running** (DigitalOcean droplet console):
  `sudo -iu dawabag bash dawabag/deploy/trial/trial.sh status` (also `logs`, `check`,
  and `dblogin` — shows that the API uses its own login `dawabag_api`, a member of
  `dawabag_app` only).
- **Tear it down:** DigitalOcean → the droplet → **Destroy** → *Destroy this Droplet*.
  Billing stops; everything on it is gone. Then delete the `TRIAL_*` secrets in GitHub
  and, in Razorpay test mode, the API key and webhook.

## If something goes wrong

- **"Your connection is not private" right after the first deploy:** the certificates
  are still being issued; wait two minutes and reload. sslip.io names get free Let's
  Encrypt certificates; if Let's Encrypt refuses (rare rate limits), use your own domain:
  point `trial.example.in`, `api.trial.example.in` and `files.trial.example.in` at the IP
  and run the Step 2 command again with `--domain trial.example.in` to get a new `TRIAL_ENV`.
- **Workflow says a secret is missing or has "change-me" values:** paste the blocks
  from Step 2 again exactly.
- **"Permission denied (publickey)":** `TRIAL_SSH_KEY` is incomplete — it must include
  the BEGIN and END lines. Run the Step 2 command again with `--new-deploy-key` and
  replace the secret.
- **Cannot log in:** the password is the `TRIAL_DEMO_PASSWORD=` value, and the demo
  data must have been loaded once (*seed demo* ticked).

---

*For developers:* the trial runs the staging stack (`deploy/staging/compose.yml`) with
the `objectstore` profile (MinIO in a Docker volume behind Caddy at `FILES_DOMAIN`,
signed links only, SSE with `OBJECTSTORE_KMS_KEY`), `APP_ENV=trial` (checked in
`backend/src/config/env.ts`; production refuses every trial-only setting), the demo
seed `backend/src/scripts/demoSeed.ts` (`--remove` takes it out again), server helper
`deploy/trial/trial.sh` and the workflow `.github/workflows/deploy-trial.yml`.
RUNBOOK section 7e.
