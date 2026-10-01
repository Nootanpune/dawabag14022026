// src/utils/sessionCookie.ts
// Web sessions: the refresh token lives only in an httpOnly, Secure, SameSite
// cookie the server sets — page scripts cannot read it and the browser keeps no
// other copy (docs/DECISIONS.md). The access token is returned in the body and
// held in memory by the web app. Mobile apps send `X-Client: mobile` (or no
// header) and receive the refresh token in the body for the OS keychain.
import { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE = 'dwb_rt';
const COOKIE_PATH = '/api/v1/auth';

// Web clients identify themselves with this header. Browsers cannot send a
// custom header cross-site without a CORS preflight, which only our origins
// pass, so requiring it on cookie-authenticated calls also blocks CSRF.
export function isWebClient(req: Request): boolean {
  return req.get('X-Client') === 'web';
}

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== 'false',  // browsers allow Secure on localhost
    sameSite: 'strict',
    path: COOKIE_PATH,
    domain: process.env.COOKIE_DOMAIN || undefined,
    maxAge: 7 * 24 * 3600 * 1000,                    // matches JWT_REFRESH_EXPIRY default
  };
}

// Puts the refresh token where this client keeps it; returns the body fields.
export function issueSession<T extends { refresh_token: string }>(req: Request, res: Response, tokens: T) {
  if (!isWebClient(req)) return tokens;
  res.cookie(REFRESH_COOKIE, tokens.refresh_token, cookieOptions());
  const { refresh_token: _omit, ...rest } = tokens;
  return rest;
}

// Refresh token from the cookie (web) or the body (mobile)
export function readRefreshToken(req: Request): string | undefined {
  if (isWebClient(req)) return req.cookies?.[REFRESH_COOKIE];
  return req.body?.refresh_token;
}

export function clearSession(res: Response): void {
  const { maxAge: _m, ...opts } = cookieOptions();
  res.clearCookie(REFRESH_COOKIE, opts);
}
