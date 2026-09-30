import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../config/database';
import { storeOTP, verifyOTP, blacklistToken } from '../config/redis';
import { generateTokens, verifyRefreshToken } from '../utils/jwt';
import { sendOTP } from '../services/sms.service';
import { sendWelcomeEmail } from '../services/email.service';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';

// ─── Validation Schemas ─────────────────────────────────────────────────────
const registerSchema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number'),
  email: z.string().email().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(2).max(255),
  role: z.enum(['customer', 'doctor', 'pharmacy']).default('customer'),
  referral_code: z.string().optional(),
});

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
    const data = registerSchema.parse(req.body);
    const { mobile, email, password, full_name, role, referral_code } = data;

    // Check if mobile already exists
    const existing = await queryOne<{ id: string }>(
      'SELECT id FROM users WHERE mobile = $1 AND deleted_at IS NULL',
      [mobile]
    );
    if (existing) throw new AppError('Mobile number already registered', 409);

    const passwordHash = await bcrypt.hash(
      password,
      parseInt(process.env.BCRYPT_ROUNDS || '12')
    );

    await withTransaction(async (client) => {
      // Create user
      const user = await client.query(
        `INSERT INTO users (mobile, email, password_hash, role)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [mobile, email || null, passwordHash, role]
      );
      const userId = user.rows[0].id;

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

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your mobile number.',
      data: { mobile, otp_sent: true },
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

    const user = await queryOne<{ id: string; role: string }>(
      `UPDATE users SET mobile_verified = TRUE, updated_at = NOW()
       WHERE mobile = $1 AND deleted_at IS NULL
       RETURNING id, role`,
      [mobile]
    );

    if (!user) throw new AppError('User not found', 404);

    const tokens = await generateTokens(user.id, user.role);

    res.json({
      success: true,
      message: 'Mobile verified successfully',
      data: {
        user_id: user.id,
        role: user.role,
        ...tokens,
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
    }>(
      `SELECT id, role, password_hash, mobile_verified, is_active,
              failed_login_attempts, locked_until
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

    const tokens = await generateTokens(user.id, user.role);

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
        full_name: profile?.full_name,
        ...tokens,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Refresh Token ──────────────────────────────────────────────────────────
export async function refreshToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) throw new AppError('Refresh token required', 400);

    const payload = await verifyRefreshToken(refresh_token);

    const user = await queryOne<{ id: string; role: string; is_active: boolean }>(
      'SELECT id, role, is_active FROM users WHERE id = $1 AND deleted_at IS NULL',
      [payload.sub]
    );

    if (!user || !user.is_active) throw new AppError('Invalid token', 401);

    // Blacklist old refresh token
    await blacklistToken(payload.jti, 7 * 24 * 3600);

    const tokens = await generateTokens(user.id, user.role);
    res.json({ success: true, data: tokens });
  } catch (error) {
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
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = await verifyRefreshToken(token).catch(() => null);
      if (decoded) await blacklistToken(decoded.jti, 7 * 24 * 3600);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
}
