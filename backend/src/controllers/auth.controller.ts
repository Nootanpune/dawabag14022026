import { Request, Response, NextFunction } from 'express';
import { privacyNoticeRef } from '../services/policy.service';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../config/database';
import { storeOTP, verifyOTP, blacklistToken } from '../config/redis';
import { generateTokens, verifyAccessToken, verifyRefreshToken } from '../utils/jwt';
import { sendOTP } from '../services/sms.service';
import { sendWelcomeEmail } from '../services/email.service';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { requiredKycDocuments } from '../utils/customerType';
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
    drug_license_type: z.enum(['dl20', 'dl21']),
    drug_license_number: z.string().trim().min(3).max(100),
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
    drug_license_type: z.enum(['dl20b', 'dl21b']),
    drug_license_number: z.string().trim().min(3).max(100),
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
    gst_unregistered_declaration: z.literal(true, {
      errorMap: () => ({ message: 'Confirm you are not registered under GST' }),
    }),
    // C-15: medicines only for dispensing to own patients; never Schedule X/NDPS; never for resale
    practitioner_declaration: z.literal(true, {
      errorMap: () => ({ message: 'Confirm you will buy only to treat your own patients, not for resale' }),
    }),
  }),
]).superRefine((d, ctx) => {
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
          trade && 'drug_license_type' in trade ? trade.drug_license_type : null,
          trade && 'drug_license_number' in trade ? trade.drug_license_number : null,
          trade && 'nmc_reg_number' in trade ? trade.nmc_reg_number : null,
          trade && 'nmc_council_state' in trade ? trade.nmc_council_state : null,
          trade && 'speciality' in trade ? trade.speciality : null,
        ]
      );
      const userId = user.rows[0].id;

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

      // Generate referral code for this user
      const myReferralCode = `${full_name.substring(0, 4).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

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

    // Send OTP for mobile verification
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await storeOTP(mobile, otp);
    await sendOTP(mobile, otp);

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
        otp_sent: true,
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

    const isValid = await verifyOTP(mobile, otp);
    if (!isValid) throw new AppError('Invalid or expired OTP', 400);

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
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { mobile, password } = loginSchema.parse(req.body);

    const user = await queryOne<{
      id: string; role: string; password_hash: string;
      mobile_verified: boolean; is_active: boolean;
      failed_login_attempts: number; locked_until: Date | null;
      customer_type: string; kyc_status: string;
    }>(
      `SELECT id, role, password_hash, mobile_verified, is_active,
              failed_login_attempts, locked_until, customer_type, kyc_status
       FROM users WHERE mobile = $1 AND deleted_at IS NULL`,
      [mobile]
    );

    if (!user) throw new AppError('Invalid credentials', 401);
    if (!user.is_active) throw new AppError('Account deactivated. Contact support.', 403);

    // Check lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / 60000
      );
      throw new AppError(`Account locked. Try again in ${minutesLeft} minutes.`, 423);
    }

    const isValid = await bcrypt.compare(password, user.password_hash);

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
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      await storeOTP(mobile, otp);
      await sendOTP(mobile, otp);
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

    const user = await queryOne<{ id: string; role: string; is_active: boolean; customer_type: string; kyc_status: string; mobile: string }>(
      `SELECT id, role, is_active, customer_type, kyc_status, mobile
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [payload.sub]
    );

    if (!user || !user.is_active) throw new AppError('Invalid token', 401);

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

    const user = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE mobile = $1 AND deleted_at IS NULL',
      [mobile]
    );
    if (!user) throw new AppError('Mobile not registered', 404);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await storeOTP(mobile, otp);
    await sendOTP(mobile, otp);

    res.json({ success: true, message: 'OTP sent', data: { otp_sent: true } });
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
