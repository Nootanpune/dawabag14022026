import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from '../utils/AppError';
import { queryOne } from '../config/database';
import { BuyerType, effectiveCustomerType } from '../utils/customerType';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        mobile: string;
        customer_type: string;        // as registered
        kyc_status: string | null;
        pricing_type: BuyerType;      // customer_type once KYC-approved, else 'customer'
      };
    }
  }
}

// customer_type and kyc_status are read from the database on every request, not
// trusted from the token, so a KYC approval or suspension takes effect at once.
const AUTH_USER_COLUMNS = 'id, role, mobile, customer_type, kyc_status';
/** The only routes a login with a temporary password may use */
const PASSWORD_CHANGE_PATHS = new Set(['/api/v1/auth/change-password', '/api/v1/auth/logout']);

interface AuthUserRow {
  id: string;
  role: string;
  mobile: string;
  customer_type: string | null;
  kyc_status: string | null;
}

function toRequestUser(row: AuthUserRow): NonNullable<Request['user']> {
  return {
    id: row.id,
    role: row.role,
    mobile: row.mobile,
    customer_type: row.customer_type || 'customer',
    kyc_status: row.kyc_status,
    pricing_type: effectiveCustomerType(row.customer_type, row.kyc_status),
  };
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

    const user = await queryOne<AuthUserRow & { is_active: boolean; must_change_password: boolean }>(
      `SELECT ${AUTH_USER_COLUMNS}, is_active, must_change_password FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [payload.sub]
    );

    if (!user) throw new AppError('User not found', 401);
    if (!user.is_active) throw new AppError('Account deactivated', 403);
    // A temporary password set by Dawabag's admin (Sprint 28) opens nothing but the
    // change-password step; enforced here so no client can skip it (C-44)
    if (user.must_change_password && !PASSWORD_CHANGE_PATHS.has(req.originalUrl.split('?')[0])) {
      throw new AppError('Please choose a new password before continuing', 403, true, 'PASSWORD_CHANGE_REQUIRED');
    }

    req.user = toRequestUser(user);
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
      const user = await queryOne<AuthUserRow>(
        `SELECT ${AUTH_USER_COLUMNS} FROM users WHERE id = $1 AND deleted_at IS NULL AND is_active = TRUE
           AND must_change_password = FALSE`,
        [payload.sub]
      );
      if (user) req.user = toRequestUser(user);
      next();
    })
    .catch(() => next());
}
