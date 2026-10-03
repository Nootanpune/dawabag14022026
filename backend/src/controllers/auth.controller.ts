import { Request, Response, NextFunction } from 'express';
import { privacyNoticeRef } from '../services/policy.service';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../config/database';
import { blacklistToken } from '../config/redis';
import { checkOtp, otpSendLimitError, storeNewOtp, takeOtpSendSlot, TOO_MANY_WRONG_CODES } from '../services/otp/otp.service';
import { generateTokens, issuedBeforePasswordChange, verifyAccessToken, verifyRefreshToken } from '../utils/jwt';
import { sendOTP } from '../services/sms.service';
import { smsConfigured } from '../services/notifications/channels/sms';

/** Sprint 40: shown on the sign-in / forgot-password screens when SMS codes cannot be sent. */
export const SMS_NOT_CONFIGURED_MESSAGE = 'Text-message codes are not switched on yet. Please sign in with your password, or ask the admin to reset it.';
import { sendWelcomeEmail } from '../services/email.service';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { requiredKycDocuments } from '../utils/customerType';
import { licenceList } from '../services/licences/input';
import { LicenceIn, licenceProblems } from '../services/licences/forms';
import { assertNumbersFree, submitLicencesTx } from '../services/licences/register.service';
import { todayIST } from '../utils/ist';
import { clearSession, issueSession, readRefreshToken } from '../utils/sessionCookie';

// ─── Validation Schemas ─────────────────────────────────────────────────────
const MOBILE_RE = /^[6-9]\d{9}$/;
const PAN_RE    = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE  = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const upper = (re: RegExp, msg: string) =>
  z.string().trim().transform((v) => v.toUpperCase()).pipe(z.string().regex(re, msg));
const pan     = upper(PAN_RE, 'Invalid PAN (format ABCDE1234F)');
const gstin   = upper(GSTIN_RE, 'Invalid GSTIN');
const pincode = z.string().regex(/^[1-9]\d{5}$/, 'Invalid pincode');

const commonFields = {
  mobile: z.string().regex(MOBILE_RE, 'Invalid Indian mobile number'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().trim().min(2).max(255),
  referral_code: z.string().optional(),
  // Rulebook C-40 / C-42: notice + consent and 18+ are mandatory; marketing is opt-in
  accept_privacy_notice: z.literal(true, {
    errorMap: () => ({ message: 'Please read and accept the privacy notice to continue' }),
  }),
  age_confirmed: z.literal(true, {
    errorMap: () => ({ message: 'You must be 18 or older to create an account' }),
  }),
  marketing_consent: z.boolean().optional().default(false),
  // Language the privacy notice was read in (DPDP s.5(3)); English unless chosen
  notice_language: z.enum(['en', 'mr', 'hi']).optional().default('en'),
};

// Bump when the privacy notice text changes; stored with every consent record

// One schema per buyer type — URS v3.1 §2 and the §3 document matrix
const registerSchema = z.discriminatedUnion('customer_type', [
  z.object({
    ...commonFields,
    customer_type: z.literal('customer'),
    email: z.string().email().optional(),
    pincode: pincode.optional(),
  }),
  z.object({
    ...commonFields,
    customer_type: z.literal('b2b_retailer'),
    email: z.string().email(),
    pincode,
    business_name: z.string().trim().min(2).max(200),
    // One licence (older apps) or every licence the shop holds (Sprint 30)
    drug_license_type: z.enum(['dl20', 'dl21']).optional(),
    drug_license_number: z.string().trim().min(3).max(100).optional(),
    licences: licenceList(10).optional(),
    pan_number: pan,
    gstin: z.union([gstin, z.literal('')]).optional(),
    gst_unregistered_declaration: z.boolean().optional(),
  }),
  z.object({
    ...commonFields,
    customer_type: z.literal('b2b_wholesaler'),
    email: z.string().email(),
    pincode,
    business_name: z.string().trim().min(2).max(200),
    drug_license_type: z.enum(['dl20b', 'dl21b']).optional(),
    drug_license_number: z.string().trim().min(3).max(100).optional(),
    licences: licenceList(10).optional(),
    gstin,
    pan_number: pan,
  }),
  z.object({
    ...commonFields,
    customer_type: z.literal('doc_hospital'),
    email: z.string().email().optional(),
    pincode,
    nmc_reg_number: z.string().trim().min(2).max(50),
    nmc_council_state: z.string().trim().min(2).max(50),
    speciality: z.string().trim().min(2).max(100),
    pan_number: pan,
    // A hospital or clinic pharmacy may add its drug licences (optional)
    licences: licenceList(10).optional(),
    gst_unregistered_declaration: z.literal(true, {
      errorMap: () => ({ message: 'Confirm you are not registered under GST' }),
    }),
    // C-15: medicines only for dispensing to own patients; never Schedule X/NDPS; never for resale
    practitioner_declaration: z.literal(true, {
      errorMap: () => ({ message: 'Confirm you will buy only to treat your own patients, not for resale' }),
    }),
  }),
]).superRefine((d, ctx) => {
  // Retailers and wholesalers give their drug licence(s): the list, or the older single pair
  if ((d.customer_type === 'b2b_retailer' || d.customer_type === 'b2b_wholesaler') && !d.licences?.length
      && !(d.drug_license_type && d.drug_license_number)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['licences'], message: 'Enter your drug licence form and number' });
  }
  // Decision A: a retailer may be unregistered, but must say so explicitly
  if (d.customer_type === 'b2b_retailer' && !d.gstin && d.gst_unregistered_declaration !== true) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['gst_unregistered_declaration'],
      message: 'Enter GSTIN, or confirm the business is not registered under GST',
    });
  }
});

type RegisterInput = z.infer<typeof registerSchema>;

const loginSchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/),
  password: z.string().min(1),
});

const otpSchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/),
  otp: z.string().length(6),
});

// ─── Register ───────────────────────────────────────────────────────────────
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const data: RegisterInput = registerSchema.parse(req.body);
    const { mobile, email, password, full_name, customer_type } = data;

    // Check if mobile already exists
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE mobile = $1 AND deleted_at IS NULL',
      [mobile]
    );
    if (existing) throw new AppError('Mobile number already registered', 409);

    if (email) {
      const emailTaken = await queryOne<{ id: string }>(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email]
      );
      if (emailTaken) throw new AppError('Email already registered', 409);
    }

    // Every drug licence the business gave (C-11): checked for form, dates and kind here,
    // stored waiting for the admin's check after the account row exists (Sprint 30)
    const licences: LicenceIn[] = 'licences' in data && data.licences?.length ? data.licences
      : 'drug_license_type' in data && data.drug_license_type && data.drug_license_number
        ? [{ form: data.drug_license_type, licence_number: data.drug_license_number }] : [];
    const party = customer_type === 'b2b_retailer' ? 'retailer' : customer_type === 'b2b_wholesaler' ? 'wholesaler' : 'doctor';
    if (customer_type !== 'customer') {
      const problems = licenceProblems(licences, { party, today: todayIST(), requireValidUpto: false });
      if (problems.length) throw new AppError(problems.join('. '), 400);
    }

    const passwordHash = await bcrypt.hash(
      password,
      parseInt(process.env.BCRYPT_ROUNDS || '12')
    );

    // Trade accounts wait for documents + admin review; B2C is active after OTP
    const kycStatus = customer_type === 'customer' ? 'not_required' : 'pending_otp';
    const trade = customer_type === 'customer' ? null : data;

    await withTransaction(async (client) => {
      // All buyer types share role 'customer'; customer_type drives pricing and KYC
      const user = await client.query(
        `INSERT INTO users (
           mobile, email, password_hash, role, customer_type, kyc_status,
           business_name, registration_pincode, pan_number, gstin,
           gst_unregistered_declaration, drug_license_type, drug_license_number,
           nmc_reg_number, nmc_council_state, doctor_speciality
           , age_confirmed_at
         ) VALUES ($1,$2,$3,'customer',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, NOW())
         RETURNING id`,
        [
          mobile, email || null, passwordHash, customer_type, kycStatus,
          trade && 'business_name' in trade ? trade.business_name : null,
          data.pincode || null,
          trade ? trade.pan_number : null,
          trade && 'gstin' in trade && trade.gstin ? trade.gstin : null,
          trade && 'gst_unregistered_declaration' in trade ? trade.gst_unregistered_declaration === true : false,
          licences[0]?.form ?? null,             // summary; the register below is the record (trigger keeps them in step)
          licences[0]?.licence_number ?? null,
          trade && 'nmc_reg_number' in trade ? trade.nmc_reg_number : null,
          trade && 'nmc_council_state' in trade ? trade.nmc_council_state : null,
          trade && 'speciality' in trade ? trade.speciality : null,
        ]
      );
      const userId = user.rows[0].id;
      if (licences.length) {
        await assertNumbersFree(client, { userId }, licences, { revealNames: false });
        await submitLicencesTx(client, { userId }, licences, userId);
      }

      // Consent log — append-only; purposes per Rulebook C-40 / C-42
      const ip = req.ip || null;
      const agent = req.get('user-agent')?.slice(0, 500) || null;
      const notice = await privacyNoticeRef(data.notice_language);
      await client.query(`UPDATE users SET preferred_language = $2 WHERE id = $1`, [userId, data.notice_language]);
      for (const [purpose, granted] of [
        ['privacy_notice', true],
        ['age_18_plus', true],
        ['marketing', data.marketing_consent],
        ...(data.customer_type === 'doc_hospital' ? [['practitioner_declaration', true] as const] : []),
      ] as const) {
        await client.query(
          `INSERT INTO consent_records (user_id, purpose, granted, policy_version, notice_language, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [userId, purpose, granted, notice.version, notice.language, ip, agent]
        );
      }

      // Referral code for consumer accounts only: never for doctors / hospitals (handover D22,
      // Sprint 38; C-20 — no referral or reward scheme for prescribers)
      const myReferralCode = data.customer_type === 'doc_hospital'
        ? null : `${full_name.substring(0, 4).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      // Create profile
      await client.query(
        `INSERT INTO user_profiles (user_id, full_name, referral_code, referred_by)
         VALUES ($1, $2, $3, $4)`,
        [userId, full_name, myReferralCode, null]
      );

      // Apply welcome coupon
      if (process.env.WELCOME_COUPON_CODE) {
        const coupon = await client.query(
          `SELECT id FROM coupons WHERE code = $1 AND is_active = TRUE`,
          [process.env.WELCOME_COUPON_CODE]
        );
        if (!coupon.rows[0]) {
          await client.query(
            `INSERT INTO coupons (code, type, value, min_order_paise, uses_limit)
             VALUES ($1, 'percentage', $2, 0, NULL)`,
            [process.env.WELCOME_COUPON_CODE, parseInt(process.env.WELCOME_COUPON_DISCOUNT || '10')]
          );
        }
      }

      return userId;
    });

    // Send OTP for mobile verification (Sprint 41 review #2, #9: per-mobile send limit, OS random source)
    const slot = await takeOtpSendSlot(mobile);
    if (slot.ok) await sendOTP(mobile, await storeNewOtp(mobile));

    if (email) {
      await sendWelcomeEmail(email, full_name);
    }

    const requiredDocuments = requiredKycDocuments(
      customer_type,
      !!(trade && 'gstin' in trade && trade.gstin)
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your mobile number.',
      data: {
        mobile,
        otp_sent: slot.ok,
        customer_type,
        kyc_required: customer_type !== 'customer',
        required_documents: requiredDocuments,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Verify OTP ─────────────────────────────────────────────────────────────
export async function verifyMobileOTP(req: Request, res: Response, next: NextFunction) {
  try {
    const { mobile, otp } = otpSchema.parse(req.body);

    // Sprint 41 review #1: wrong codes count per mobile here too (five, then the code is gone)
    const check = await checkOtp(mobile, otp);
    if (check === 'too_many') throw new AppError(TOO_MANY_WRONG_CODES, 400);
    if (check !== 'ok') throw new AppError('Invalid or expired OTP', 400);

    const user = await queryOne<{ id: string; role: string; customer_type: string; kyc_status: string }>(
      `UPDATE users SET mobile_verified = TRUE, updated_at = NOW()
       WHERE mobile = $1 AND deleted_at IS NULL
       RETURNING id, role, customer_type, kyc_status`,
      [mobile]
    );

    if (!user) throw new AppError('User not found', 404);

    const tokens = await generateTokens(user.id, user.role, user.customer_type);
    const profile = await queryOne<{ full_name: string }>(
      'SELECT full_name FROM user_profiles WHERE user_id = $1',
      [user.id]
    );

    res.json({
      success: true,
      message: 'Mobile verified successfully',
      data: {
        user_id: user.id,
        role: user.role,
        customer_type: user.customer_type,
        kyc_status: user.kyc_status,
        full_name: profile?.full_name,
        ...issueSession(req, res, tokens),
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Login ──────────────────────────────────────────────────────────────────
let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= bcrypt.hash('not-a-real-password-0', parseInt(process.env.BCRYPT_ROUNDS || '12')));

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { mobile, password } = loginSchema.parse(req.body);

    const user = await queryOne<{
      id: string; role: string; password_hash: string;
      mobile_verified: boolean; is_active: boolean;
      failed_login_attempts: number; locked_until: Date | null;
      customer_type: string; kyc_status: string; must_change_password: boolean;
    }>(
      `SELECT id, role, password_hash, mobile_verified, is_active,
              failed_login_attempts, locked_until, customer_type, kyc_status, must_change_password
       FROM users WHERE mobile = $1 AND deleted_at IS NULL`,
      [mobile]
    );

    // An unknown mobile costs the same bcrypt work as a wrong password, so the answer's
    // timing does not tell which mobiles have an account (Sprint 34 review, C-44)
    if (!user) { await bcrypt.compare(password, await dummyHash()); throw new AppError('Invalid credentials', 401); }
    if (!user.is_active) throw new AppError('Account deactivated. Contact support.', 403);

    // Check lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / 60000
      );
      throw new AppError(`Account locked. Try again in ${minutesLeft} minutes.`, 423);
    }

    // An erased account has no password hash: treat as wrong credentials, never crash
    const isValid = !!user.password_hash && await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      const attempts = user.failed_login_attempts + 1;
      const maxAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5');

      if (attempts >= maxAttempts) {
        const lockDuration = parseInt(process.env.LOCKOUT_DURATION_MINUTES || '30');
        await query(
          `UPDATE users SET failed_login_attempts = $1,
           locked_until = NOW() + INTERVAL '${lockDuration} minutes'
           WHERE id = $2`,
          [attempts, user.id]
        );
        throw new AppError(`Too many attempts. Account locked for ${lockDuration} minutes.`, 423);
      }

      await query(
        'UPDATE users SET failed_login_attempts = $1 WHERE id = $2',
        [attempts, user.id]
      );
      throw new AppError('Invalid credentials', 401);
    }

    if (!user.mobile_verified) {
      if ((await takeOtpSendSlot(mobile)).ok) await sendOTP(mobile, await storeNewOtp(mobile));
      throw new AppError('Mobile not verified. OTP sent.', 403);
    }

    // Reset failed attempts and record login
    await query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL,
       last_login_at = NOW() WHERE id = $1`,
      [user.id]
    );

    const tokens = await generateTokens(user.id, user.role, user.customer_type);

    // Fetch profile
    const profile = await queryOne<{ full_name: string }>(
      'SELECT full_name FROM user_profiles WHERE user_id = $1',
      [user.id]
    );

    res.json({
      success: true,
      data: {
        user_id: user.id,
        role: user.role,
        customer_type: user.customer_type,
        kyc_status: user.kyc_status,
        full_name: profile?.full_name,
        // Sprint 28: a temporary password from Dawabag's admin must be replaced first
        must_change_password: user.must_change_password,
        ...issueSession(req, res, tokens),
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Refresh Token ──────────────────────────────────────────────────────────
// Also how the web app restores a session on page load: the cookie is the
// credential, and the response carries the current account state from the DB.
export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    const refresh_token = readRefreshToken(req);
    if (!refresh_token) throw new AppError('Not signed in', 401);

    const payload = await verifyRefreshToken(refresh_token);

    const user = await queryOne<{ id: string; role: string; is_active: boolean; customer_type: string; kyc_status: string; mobile: string;
      must_change_password: boolean; password_changed_at: Date | null }>(
      `SELECT id, role, is_active, customer_type, kyc_status, mobile, must_change_password, password_changed_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [payload.sub]
    );

    if (!user || !user.is_active) throw new AppError('Invalid token', 401);
    // A refresh token from before the last password change cannot be renewed (Sprint 34 review, C-44)
    if (issuedBeforePasswordChange(payload.iat, user.password_changed_at)) {
      throw new AppError('Your password was changed. Please sign in again', 401);
    }

    // Rotate: the old refresh token can never be used again
    await blacklistToken(payload.jti, 7 * 24 * 3600);

    const tokens = await generateTokens(user.id, user.role, user.customer_type);
    const profile = await queryOne<{ full_name: string }>(
      'SELECT full_name FROM user_profiles WHERE user_id = $1',
      [user.id]
    );
    res.json({
      success: true,
      data: {
        user_id: user.id,
        role: user.role,
        customer_type: user.customer_type,
        kyc_status: user.kyc_status,
        mobile: user.mobile,
        full_name: profile?.full_name,
        must_change_password: user.must_change_password,
        ...issueSession(req, res, tokens),
      },
    });
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401) clearSession(res);
    next(error);
  }
}

// ─── Send OTP (standalone) ──────────────────────────────────────────────────
export async function sendLoginOTP(req: Request, res: Response, next: NextFunction) {
  try {
    const { mobile } = z.object({
      mobile: z.string().regex(/^[6-9]\d{9}$/),
    }).parse(req.body);

    // Sprint 40: no SMS provider (e.g. the trial) → say so plainly instead of "code sent".
    // The same answer for every number, so it reveals nothing about who has an account.
    if (!smsConfigured()) throw new AppError(SMS_NOT_CONFIGURED_MESSAGE, 503, true, 'SMS_NOT_CONFIGURED');
    // Sprint 41 review #2: a limit per mobile, counted before the account lookup (so it
    // says nothing about who has an account) — no SMS flooding or SMS bill through this form
    const slot = await takeOtpSendSlot(mobile);
    if (!slot.ok) throw otpSendLimitError(slot.retryAfterS);

    // Same answer, at the same speed, whether or not the mobile is registered (Sprint 35:
    // sign-in by OTP and "Forgot password" use this; it must not tell anyone which
    // mobiles have accounts). The SMS goes out after the answer.
    const user = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE mobile = $1 AND deleted_at IS NULL',
      [mobile]
    );
    if (user) {
      const otp = await storeNewOtp(mobile);
      setImmediate(() => { sendOTP(mobile, otp).catch((e) => logger.warn(`OTP SMS failed: ${(e as Error).message}`)); });
    }

    res.json({ success: true, message: 'If this mobile number has an account, a code has been sent to it', data: { otp_sent: true } });
  } catch (error) {
    next(error);
  }
}

// ─── Logout ─────────────────────────────────────────────────────────────────
// Revokes the refresh token (cookie or body) and the presented access token.
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    let userId: string | null = null;
    const refresh = readRefreshToken(req);
    if (refresh) {
      const decoded = await verifyRefreshToken(refresh).catch(() => null);
      if (decoded) { await blacklistToken(decoded.jti, 7 * 24 * 3600); userId = decoded.sub; }
    }
    const access = req.headers.authorization?.split(' ')[1];
    if (access) {
      const decoded = await verifyAccessToken(access).catch(() => null);
      if (decoded) { await blacklistToken(decoded.jti, 15 * 60); userId = userId ?? decoded.sub; }
    }
    // This device stops receiving pushes for the account signing out (never someone else's)
    if (userId && typeof req.body?.fcm_token === 'string' && req.body.fcm_token) {
      await query('DELETE FROM user_devices WHERE fcm_token = $1 AND user_id = $2', [req.body.fcm_token, userId]);
    }
    clearSession(res);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}
