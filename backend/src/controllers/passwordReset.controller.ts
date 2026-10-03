// src/controllers/passwordReset.controller.ts — "Forgot password": the OTP sent by
// POST /auth/send-otp to the registered mobile proves the person holds it; they then
// choose a new password (Sprint 35, for the restyled sign-in pages; the app's
// forgot-password screens call the same endpoint). Every existing session ends
// (password_changed_at, Sprint 34) and a fresh one is issued. After 5 wrong codes the
// OTP is thrown away. Passwords are never logged or audited (C-41, C-44, C-46).
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { queryOne, withTransaction } from '../config/database';
import { checkOtp, TOO_MANY_WRONG_CODES } from '../services/otp/otp.service';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { generateTokens } from '../utils/jwt';
import { passwordProblem } from '../utils/passwordPolicy';
import { issueSession } from '../utils/sessionCookie';

const schema = z.object({
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  new_password: z.string({ required_error: 'Choose a new password' }).max(200),
});

// POST /auth/reset-password { mobile, otp, new_password }
export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const d = schema.parse(req.body);
    const problem = passwordProblem(d.new_password, d.mobile);
    if (problem) throw new AppError(problem, 400);
    // Wrong codes are counted per mobile by the OTP service, also across /auth/verify-otp (Sprint 41 review #1)
    const check = await checkOtp(d.mobile, d.otp);
    if (check === 'too_many') throw new AppError(TOO_MANY_WRONG_CODES, 400);
    if (check !== 'ok') throw new AppError('The code is wrong or has expired', 400);
    const user = await queryOne<{ id: string; role: string; customer_type: string; kyc_status: string }>(
      `SELECT id, role, customer_type, kyc_status FROM users WHERE mobile = $1 AND deleted_at IS NULL AND is_active`, [d.mobile]);
    // Unknown or switched-off account: the same answer as a wrong code (Sprint 41 review #10)
    if (!user) throw new AppError('The code is wrong or has expired', 400);
    const hash = await bcrypt.hash(d.new_password, parseInt(process.env.BCRYPT_ROUNDS || '12'));
    const changedAt = new Date();   // API clock, as token iat is: older sessions stop working
    await withTransaction(async (c) => {
      await c.query(
        `UPDATE users SET password_hash = $2, must_change_password = FALSE, password_changed_at = $3, mobile_verified = TRUE,
                failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1`, [user.id, hash, changedAt]);
      await writeAuditTx(c, { userId: user.id, action: 'password_reset_by_otp', performedBy: user.id, ip: req.ip ?? null });
    });
    const tokens = await generateTokens(user.id, user.role, user.customer_type);
    const profile = await queryOne<{ full_name: string }>('SELECT full_name FROM user_profiles WHERE user_id = $1', [user.id]);
    res.json({
      success: true,
      message: 'Password changed',
      data: {
        user_id: user.id, role: user.role, customer_type: user.customer_type, kyc_status: user.kyc_status,
        mobile: d.mobile, full_name: profile?.full_name, must_change_password: false,
        ...issueSession(req, res, tokens),
      },
    });
  } catch (err) { next(err); }
}
