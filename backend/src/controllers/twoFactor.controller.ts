// Two-step sign-in with an authenticator app (Sprint 42; security review Sprints 35–40 #16;
// C-41, C-43, C-46). Routes in auth.routes.ts (/auth/2fa/*) and admin.routes.ts
// (/admin/two-factor). Web and the mobile app call the same endpoints; the web receives the
// refresh token only as the httpOnly cookie (utils/sessionCookie.ts).
import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { authenticate } from '../middleware/auth.middleware';
import { Challenge, dropChallenge, readChallenge, takeChallenge } from '../services/twoFactor/challenge';
import {
  checkSecondStep, confirmEnrolment, disableTwoFactor, regenerateRecoveryCodes, resetTwoFactor, startEnrolment,
  twoFactorOverview, twoFactorStatus,
} from '../services/twoFactor/enrolment.service';
import { sessionPayload, signInUserById } from '../services/twoFactor/signIn.service';

declare global {
  namespace Express {
    interface Request {
      /** Sprint 42: the sign-in challenge this request answers (enrolment before the first session) */
      twoFactorChallenge?: Challenge & { token: string };
    }
  }
}

const EXPIRED = () => new AppError('This sign-in has expired. Please sign in again.', 401, true, 'TWO_FACTOR_CHALLENGE_EXPIRED');
const challengeToken = z.string().min(20).max(200);
const code = z.string().trim().min(6, 'Enter the 6-digit code').max(20);
const ip = (req: Request) => req.ip ?? null;

/** Enrolment routes: either a signed-in staff session, or the 'enrol' challenge from sign-in. */
export function authOrEnrolChallenge(req: Request, res: Response, next: NextFunction) {
  const token = req.body?.challenge_token;
  if (token === undefined) return authenticate(req, res, next);
  readChallenge(String(token))
    .then((ch) => {
      if (!ch || ch.purpose !== 'enrol') throw EXPIRED();
      req.twoFactorChallenge = { ...ch, token: String(token) };
      next();
    })
    .catch(next);
}

const enrolUserId = (req: Request) => req.twoFactorChallenge?.userId ?? req.user!.id;

// POST /auth/2fa/verify { challenge_token, code } — the second step: an authenticator code or a recovery code
export async function verifyChallenge(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ challenge_token: challengeToken, code }).parse(req.body);
    const ch = await readChallenge(d.challenge_token);
    if (!ch || ch.purpose !== 'code') throw EXPIRED();
    const user = await signInUserById(ch.userId);
    let result;
    try {
      result = await checkSecondStep(user.id, d.code, ip(req), { stage: 'sign_in', via: ch.via });
    } catch (e) {
      // Paused after too many wrong codes: this sign-in is over
      if (e instanceof AppError && e.code === 'TWO_FACTOR_PAUSED') await dropChallenge(d.challenge_token);
      throw e;
    }
    // Single use: a second request with the same challenge finds nothing
    if (!(await takeChallenge(d.challenge_token))) throw EXPIRED();
    res.json({
      success: true,
      data: {
        ...(await sessionPayload(req, res, user, true)),
        second_step: result.method,
        recovery_codes_left: result.recoveryCodesLeft,
      },
    });
  } catch (err) { next(err); }
}

// POST /auth/2fa/enrol/start { challenge_token? } — a new secret: QR code (drawn on the server) and the text key
export async function postEnrolStart(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await startEnrolment(enrolUserId(req)) });
  } catch (err) { next(err); }
}

// POST /auth/2fa/enrol/confirm { code, challenge_token? } — switches it on; ten recovery codes, shown once; a two-step session
export async function postEnrolConfirm(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from the app') }).parse(req.body);
    const userId = enrolUserId(req);
    const ch = req.twoFactorChallenge;
    const codes = await confirmEnrolment(userId, d.code, ip(req), ch?.via ?? 'signed_in');
    if (ch && !(await takeChallenge(ch.token))) throw EXPIRED();
    // A session opened with the code (also replaces a signed-in session that had no second step)
    const user = await signInUserById(userId);
    res.json({
      success: true,
      message: 'Two-step sign-in is on',
      data: { recovery_codes: codes, ...(await sessionPayload(req, res, user, true)) },
    });
  } catch (err) { next(err); }
}

// GET /auth/2fa/status
export async function getStatus(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: { ...(await twoFactorStatus(req.user!.id, req.user!.role)), session_two_step: req.authMfa === true } });
  } catch (err) { next(err); }
}

const passwordAndCode = z.object({ password: z.string().min(1, 'Enter your password').max(200), code });

// POST /auth/2fa/disable { password, code }
export async function postDisable(req: Request, res: Response, next: NextFunction) {
  try {
    const d = passwordAndCode.parse(req.body);
    await disableTwoFactor(req.user!.id, d.password, d.code, ip(req));
    res.json({ success: true, message: 'Two-step sign-in is off' });
  } catch (err) { next(err); }
}

// POST /auth/2fa/recovery-codes { password, code } — ten new codes; the old ones stop working
export async function postRecoveryCodes(req: Request, res: Response, next: NextFunction) {
  try {
    const d = passwordAndCode.parse(req.body);
    res.json({ success: true, data: { recovery_codes: await regenerateRecoveryCodes(req.user!.id, d.password, d.code, ip(req)) } });
  } catch (err) { next(err); }
}

// GET /admin/two-factor — staff and partner logins with their state (admins)
export async function getOverview(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await twoFactorOverview() }); } catch (err) { next(err); }
}

// POST /admin/two-factor/:userId/reset { reason } — super-admin only, audited
export async function postReset(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = z.string().uuid().parse(req.params.userId);
    const d = z.object({ reason: z.string().trim().min(10, 'Say why (at least 10 characters), e.g. "lost phone, identity checked by call"').max(500) }).parse(req.body);
    res.json({ success: true, data: await resetTwoFactor(req.user!.id, userId, d.reason, ip(req)) });
  } catch (err) { next(err); }
}
