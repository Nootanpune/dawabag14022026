// src/services/coupon.service.ts
// Coupon evaluation shared by the cart preview and order creation, so both
// always agree. Discounts apply only to non-prescription lines (Rulebook C-21:
// no promotional discount on Schedule H / H1 medicines).
import { PoolClient } from 'pg';
import { AppError } from '../utils/AppError';

export interface CouponLine {
  drug_schedule: string | null;
  line_subtotal_paise: number;   // pre-GST value of the line
}

export interface CouponResult {
  couponId: string;
  code: string;
  discountPaise: number;
  eligibleSubtotalPaise: number;
}

const RX_SCHEDULES = ['Schedule H', 'Schedule H1'];

type Queryable = Pick<PoolClient, 'query'>;

// Throws AppError(400) with a buyer-readable reason when the coupon cannot apply.
export async function evaluateCoupon(db: Queryable, code: string, lines: CouponLine[]): Promise<CouponResult> {
  const res = await db.query(
    `SELECT id, code, type, value, min_order_paise, max_discount_paise
     FROM coupons WHERE code = $1 AND is_active = TRUE
       AND valid_from <= NOW()
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (uses_limit IS NULL OR uses_count < uses_limit)`,
    [code.trim().toUpperCase()]
  );
  const c = res.rows[0];
  if (!c) throw new AppError('Invalid or expired coupon', 400);

  const eligible = lines
    .filter((l) => !RX_SCHEDULES.includes(l.drug_schedule ?? ''))
    .reduce((sum, l) => sum + l.line_subtotal_paise, 0);
  if (eligible === 0) {
    throw new AppError('Coupons cannot be used on prescription medicines', 400);
  }
  if (eligible < c.min_order_paise) {
    throw new AppError(`Minimum order ₹${Math.round(c.min_order_paise / 100)} (excluding prescription medicines) required for this coupon`, 400);
  }

  let discount = 0;
  if (c.type === 'percentage') {
    discount = Math.round(eligible * c.value / 100);
    if (c.max_discount_paise) discount = Math.min(discount, c.max_discount_paise);
  } else if (c.type === 'flat') {
    discount = Math.min(c.value, eligible);
  } else {
    throw new AppError('This coupon type is not supported yet', 400);
  }

  return { couponId: c.id, code: c.code, discountPaise: discount, eligibleSubtotalPaise: eligible };
}
