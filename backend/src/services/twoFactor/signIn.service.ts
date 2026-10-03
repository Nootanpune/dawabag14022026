// The end of every first step — password (/auth/login), SMS code (/auth/verify-otp) and
// "Forgot password" (/auth/reset-password): either the session (tokens; the web cookie) or,
// for a login with two-step sign-in, a challenge for the authenticator code — or, when it is
// required and not yet set up, for enrolment. Nothing that opens a session is issued before
// the second step (Sprint 42; security review Sprints 35–40 #16; C-41, C-43, C-44).
import { Request, Response } from 'express';
import { queryOne } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { generateTokens } from '../../utils/jwt';
import { issueSession } from '../../utils/sessionCookie';
import { createChallenge, FirstStep } from './challenge';
import { isEnrolled, twoFactorPolicy } from './enrolment.service';
import { appliesToRole, signInStep } from './policy';

export interface SignInUser {
  id: string;
  role: string;
  customer_type: string;
  kyc_status: string | null;
  mobile?: string | null;
  must_change_password?: boolean;
}

/** The account as the sign-in answer needs it (active, not erased). */
export async function signInUserById(userId: string): Promise<SignInUser> {
  const u = await queryOne<SignInUser>(
    `SELECT id, role, customer_type, kyc_status, mobile, must_change_password FROM users WHERE id = $1 AND deleted_at IS NULL AND is_active`, [userId]);
  if (!u) throw new AppError('This sign-in has expired. Please sign in again.', 401, true, 'TWO_FACTOR_CHALLENGE_EXPIRED');
  return u;
}

/** Tokens + the answer the clients already read (the web gets the refresh token as the httpOnly cookie). */
export async function sessionPayload(req: Request, res: Response, user: SignInUser, mfa: boolean) {
  const tokens = await generateTokens(user.id, user.role, user.customer_type, { mfa });
  const profile = await queryOne<{ full_name: string }>('SELECT full_name FROM user_profiles WHERE user_id = $1', [user.id]);
  return {
    user_id: user.id,
    role: user.role,
    customer_type: user.customer_type,
    kyc_status: user.kyc_status,
    ...(user.mobile ? { mobile: user.mobile } : {}),
    full_name: profile?.full_name,
    // Sprint 28: a temporary password from Dawabag's admin must be replaced first
    must_change_password: !!user.must_change_password,
    ...issueSession(req, res, tokens),
  };
}

export interface ChallengeAnswer {
  /** 'code' = ask for the authenticator code (or a recovery code); 'enrol' = set it up first */
  two_factor: 'code' | 'enrol';
  challenge_token: string;
  expires_in: number;
  methods: ('authenticator' | 'recovery_code')[];
}

/** After a first step: the session, or the second step's challenge. */
export async function sessionOrChallenge(req: Request, res: Response, user: SignInUser, via: FirstStep) {
  if (!appliesToRole(user.role)) return sessionPayload(req, res, user, false);
  const step = signInStep(user.role, await isEnrolled(user.id), await twoFactorPolicy());
  if (step === 'session') return sessionPayload(req, res, user, false);
  const ch = await createChallenge(user.id, step, via);
  const answer: ChallengeAnswer = {
    two_factor: step, challenge_token: ch.token, expires_in: ch.expiresIn,
    methods: step === 'code' ? ['authenticator', 'recovery_code'] : ['authenticator'],
  };
  return answer;
}

export const isChallenge = (d: unknown): d is ChallengeAnswer =>
  !!d && typeof d === 'object' && ((d as any).two_factor === 'code' || (d as any).two_factor === 'enrol');

export const CHALLENGE_MESSAGE = {
  code: 'Enter the 6-digit code from your authenticator app',
  enrol: 'Two-step sign-in is required for your login: set up an authenticator app to continue',
} as const;
