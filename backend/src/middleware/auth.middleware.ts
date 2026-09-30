import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from '../utils/AppError';
import { queryOne } from '../config/database';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string; mobile: string };
    }
  }
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('Authentication required', 401);
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyAccessToken(token);

    const user = await queryOne<{ id: string; role: string; mobile: string; is_active: boolean }>(
      'SELECT id, role, mobile, is_active FROM users WHERE id = $1 AND deleted_at IS NULL',
      [payload.sub]
    );

    if (!user) throw new AppError('User not found', 401);
    if (!user.is_active) throw new AppError('Account deactivated', 403);

    req.user = { id: user.id, role: user.role, mobile: user.mobile };
    next();
  } catch (error) {
    next(error);
  }
}

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Authentication required', 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Access denied', 403));
    }
    next();
  };
}

export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return next();

  const token = authHeader.split(' ')[1];
  verifyAccessToken(token)
    .then(async (payload) => {
      const user = await queryOne<{ id: string; role: string; mobile: string }>(
        'SELECT id, role, mobile FROM users WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE',
        [payload.sub]
      );
      if (user) req.user = user;
      next();
    })
    .catch(() => next());
}
