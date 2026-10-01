import jwt, { SignOptions } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from './AppError';
import { isTokenBlacklisted } from '../config/redis';

interface TokenPayload {
  sub: string;
  role: string;
  customer_type?: string;
  jti: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

// customer_type is carried for clients (web/mobile) to pick the right screens.
// The API itself re-reads customer_type and kyc_status from the database on
// every request (auth.middleware), so a stale token cannot unlock B2B pricing.
export async function generateTokens(
  userId: string,
  role: string,
  customerType: string = 'customer'
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const accessJti = uuidv4();
  const refreshJti = uuidv4();

  const accessToken = jwt.sign(
    { sub: userId, role, customer_type: customerType, jti: accessJti, type: 'access' },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: (process.env.JWT_ACCESS_EXPIRY || '15m') as SignOptions['expiresIn'] }
  );

  const refreshToken = jwt.sign(
    { sub: userId, role, customer_type: customerType, jti: refreshJti, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: (process.env.JWT_REFRESH_EXPIRY || '7d') as SignOptions['expiresIn'] }
  );

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: 15 * 60,
  };
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_ACCESS_SECRET!
    ) as TokenPayload;

    if (payload.type !== 'access') throw new AppError('Invalid token type', 401);

    const blacklisted = await isTokenBlacklisted(payload.jti);
    if (blacklisted) throw new AppError('Token has been revoked', 401);

    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Invalid or expired token', 401);
  }
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_REFRESH_SECRET!
    ) as TokenPayload;

    if (payload.type !== 'refresh') throw new AppError('Invalid token type', 401);

    const blacklisted = await isTokenBlacklisted(payload.jti);
    if (blacklisted) throw new AppError('Token has been revoked', 401);

    return payload;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Invalid or expired refresh token', 401);
  }
}
