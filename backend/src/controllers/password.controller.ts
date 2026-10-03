// src/controllers/password.controller.ts — a signed-in person changes their password.
// Required first for a login created by Dawabag's admin with a temporary password
// (users.must_change_password, Sprint 28); clearing the flag opens the account.
// The old session is revoked and a new one issued (C-44). Passwords are never logged
// or audited (C-41, C-46).
import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { queryOne, withTransaction } from '../config/database';
import { blacklistToken } from '../config/redis';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { generateTokens, verifyAccessToken, verifyRefreshToken } from '../utils/jwt';
import { passwordProblem } from '../utils/passwordPolicy';
import { issueSession, readRefreshToken } from '../utils/sessionCookie';

const schema = z.object({
  current_password: z.string({ required_error: 'Enter your current password' }).min(1, 'Enter your current password').max(200),
  new_password: z.string({ required_error: 'Choose a new password' }).max(200),
});

// POST /auth/change-password { current_password, new_password }
export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const d = schema.parse(req.body);
    const user = await queryOne<{ id: string; role: string; mobile: string; customer_type: string; kyc_status: string;
      password_hash: string | null; must_change_password: boolean }>(
      `SELECT id, role, mobile, customer_type, kyc_status, password_hash, must_change_password
       FROM users WHERE id = $1 AND deleted_at IS NULL`, [req.user!.id]);
    if (!user) throw new AppError('Account not found', 401);
    if (!user.password_hash || !(await bcrypt.compare(d.current_password, user.password_hash))) {
      throw new AppError('Your current password is not right', 400);
    }
    const problem = passwordProblem(d.new_password, user.mobile);
    if (problem) throw new AppError(problem, 400);
    if (await bcrypt.compare(d.new_password, user.password_hash)) {
      throw new AppError('Choose a new password that is different from the current one', 400);
    }
    const hash = await bcrypt.hash(d.new_password, parseInt(process.env.BCRYPT_ROUNDS || '12'));
    // From the API's clock, as token iat is: every token issued before this second stops
    // working (auth.middleware, refresh) — all other sessions end (Sprint 34 review, C-44)
    const changedAt = new Date();
    await withTransaction(async (c) => {
      await c.query(
        `UPDATE users SET password_hash = $2, must_change_password = FALSE, password_changed_at = $3,
                failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1`, [user.id, hash, changedAt]);
      await writeAuditTx(c, { userId: user.id, action: 'password_changed', performedBy: user.id, ip: req.ip ?? null,
        newValue: { temporary_password_replaced: user.must_change_password } });
    });

    // The session that used the old password ends here; a fresh one replaces it
    const refresh = readRefreshToken(req);
    const oldRefresh = refresh ? await verifyRefreshToken(refresh).catch(() => null) : null;
    if (oldRefresh && oldRefresh.sub === user.id) await blacklistToken(oldRefresh.jti, 7 * 24 * 3600);
    const access = req.headers.authorization?.split(' ')[1];
    const oldAccess = access ? await verifyAccessToken(access).catch(() => null) : null;
    if (oldAccess) await blacklistToken(oldAccess.jti, 15 * 60);

    // Sprint 42: a session opened with the authenticator code stays a two-step session
    const tokens = await generateTokens(user.id, user.role, user.customer_type, { mfa: req.authMfa === true });
    const profile = await queryOne<{ full_name: string }>('SELECT full_name FROM user_profiles WHERE user_id = $1', [user.id]);
    res.json({
      success: true,
      message: 'Password changed',
      data: {
        user_id: user.id, role: user.role, customer_type: user.customer_type, kyc_status: user.kyc_status,
        mobile: user.mobile, full_name: profile?.full_name, must_change_password: false,
        ...issueSession(req, res, tokens),
      },
    });
  } catch (err) { next(err); }
}
