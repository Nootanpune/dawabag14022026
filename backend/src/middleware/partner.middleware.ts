// src/middleware/partner.middleware.ts
// Partner portal access: a 'partner' login linked to one approved vendor
// through vendor_users. The vendor is looked up on every request (server is
// the source of truth), so unlinking or suspending a partner takes effect now.
import { Request, Response, NextFunction } from 'express';
import { queryOne } from '../config/database';
import { AppError } from '../utils/AppError';

declare global {
  namespace Express {
    interface Request {
      partner?: { vendorId: string; name: string; approvalStatus: string; isActive: boolean };
    }
  }
}

export async function requirePartner(req: Request, _res: Response, next: NextFunction) {
  try {
    if (req.user?.role !== 'partner') throw new AppError('Partner access only', 403);
    const v = await queryOne<{ id: string; name: string; approval_status: string; is_active: boolean }>(
      `SELECT v.id, v.name, v.approval_status, v.is_active
       FROM vendor_users vu JOIN vendors v ON v.id = vu.vendor_id
       WHERE vu.user_id = $1`,
      [req.user.id]
    );
    if (!v) throw new AppError('This login is not linked to a partner', 403);
    req.partner = { vendorId: v.id, name: v.name, approvalStatus: v.approval_status, isActive: v.is_active };
    // A suspended or unapproved partner may only look at its account, settlements and returns
    const readOnly = req.method === 'GET' && /^\/(me|settlements|returns)(\/|$)/.test(req.path);
    if ((v.approval_status !== 'approved' || !v.is_active) && !readOnly) {
      throw new AppError('Your partner account is not active; contact Dawabag', 403);
    }
    next();
  } catch (err) { next(err); }
}
