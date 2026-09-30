import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { query, queryOne } from '../config/database';
import { AppError } from '../utils/AppError';

// ─── COUPON ROUTES ────────────────────────────────────────────────────────────
export const couponRouter = Router();

couponRouter.post('/validate', authenticate, async (req, res, next) => {
  try {
    const { code, order_amount_paise } = req.body;
    if (!code) throw new AppError('Coupon code required', 400);

    const coupon = await queryOne(
      `SELECT id, code, type, value, min_order_paise, max_discount_paise
       FROM coupons
       WHERE code = $1 AND is_active = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (uses_limit IS NULL OR uses_count < uses_limit)`,
      [code.toUpperCase()]
    );

    if (!coupon) throw new AppError('Invalid or expired coupon', 404);

    if (order_amount_paise && order_amount_paise < coupon.min_order_paise) {
      throw new AppError(`Minimum order ₹${coupon.min_order_paise / 100} required`, 400);
    }

    let discount_paise = 0;
    if (coupon.type === 'percentage') {
      discount_paise = Math.round(order_amount_paise * coupon.value / 100);
      if (coupon.max_discount_paise) discount_paise = Math.min(discount_paise, coupon.max_discount_paise);
    } else if (coupon.type === 'flat') {
      discount_paise = coupon.value;
    } else if (coupon.type === 'free_shipping') {
      discount_paise = 0; // handled at order level
    }

    res.json({
      success: true,
      data: {
        coupon_id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discount_paise,
      },
    });
  } catch (e) { next(e); }
});

couponRouter.get('/', authenticate, authorize('admin', 'super_admin'), async (_req, res, next) => {
  try {
    const coupons = await query('SELECT * FROM coupons ORDER BY created_at DESC', []);
    res.json({ success: true, data: coupons });
  } catch (e) { next(e); }
});

couponRouter.post('/', authenticate, authorize('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { code, type, value, min_order_paise, max_discount_paise, uses_limit, expires_at } = req.body;
    if (!code || !type || value == null) throw new AppError('code, type, value required', 400);

    const coupon = await queryOne(
      `INSERT INTO coupons (code, type, value, min_order_paise, max_discount_paise, uses_limit, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, code`,
      [code.toUpperCase(), type, value, min_order_paise || 0, max_discount_paise || null,
       uses_limit || null, expires_at || null, req.user!.id]
    );
    res.status(201).json({ success: true, data: coupon });
  } catch (e) { next(e); }
});

couponRouter.patch('/:couponId', authenticate, authorize('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { is_active, expires_at } = req.body;
    await query(
      'UPDATE coupons SET is_active = COALESCE($1, is_active), expires_at = COALESCE($2, expires_at) WHERE id = $3',
      [is_active, expires_at || null, req.params.couponId]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ─── NOTIFICATION ROUTES ──────────────────────────────────────────────────────
export const notificationRouter = Router();

notificationRouter.get('/my', authenticate, async (req, res, next) => {
  try {
    const notifications = await query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 30',
      [req.user!.id]
    );
    const unread = await queryOne<{ count: string }>(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [req.user!.id]
    );
    res.json({ success: true, data: { notifications, unread_count: parseInt(unread?.count || '0') } });
  } catch (e) { next(e); }
});

notificationRouter.patch('/my/read-all', authenticate, async (req, res, next) => {
  try {
    await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.user!.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ─── REPORT ROUTES ────────────────────────────────────────────────────────────
export const reportRouter = Router();

reportRouter.get('/gst', authenticate, authorize('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { from_date, to_date } = req.query;
    if (!from_date || !to_date) throw new AppError('from_date and to_date required', 400);

    const report = await query(
      `SELECT
         o.order_number, o.created_at,
         up.full_name as customer_name, u.mobile,
         a.state as delivery_state,
         o.subtotal_paise, o.discount_paise, o.shipping_paise,
         SUM(oi.cgst_paise) as total_cgst,
         SUM(oi.sgst_paise) as total_sgst,
         SUM(oi.igst_paise) as total_igst,
         o.total_paise
       FROM orders o
       JOIN users u ON u.id = o.user_id
       LEFT JOIN user_profiles up ON up.user_id = o.user_id
       LEFT JOIN addresses a ON a.id = o.address_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.status NOT IN ('pending_payment','payment_failed','cancelled')
         AND o.created_at BETWEEN $1 AND $2
         AND o.deleted_at IS NULL
       GROUP BY o.id, up.full_name, u.mobile, a.state
       ORDER BY o.created_at`,
      [from_date, to_date]
    );

    const summary = await queryOne(
      `SELECT
         COUNT(DISTINCT o.id) as total_orders,
         COALESCE(SUM(o.total_paise),0) as total_revenue,
         COALESCE(SUM(oi.cgst_paise),0) as total_cgst,
         COALESCE(SUM(oi.sgst_paise),0) as total_sgst,
         COALESCE(SUM(oi.igst_paise),0) as total_igst
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.status NOT IN ('pending_payment','payment_failed','cancelled')
         AND o.created_at BETWEEN $1 AND $2 AND o.deleted_at IS NULL`,
      [from_date, to_date]
    );

    res.json({ success: true, data: { summary, line_items: report } });
  } catch (e) { next(e); }
});

reportRouter.get('/sales', authenticate, authorize('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { from_date, to_date } = req.query;
    if (!from_date || !to_date) throw new AppError('from_date and to_date required', 400);

    const topProducts = await query(
      `SELECT p.name, p.sku, SUM(oi.quantity) as units_sold,
              SUM(oi.line_total_paise) as revenue_paise
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       JOIN orders o ON o.id = oi.order_id
       WHERE o.created_at BETWEEN $1 AND $2
         AND o.status NOT IN ('pending_payment','payment_failed','cancelled')
       GROUP BY p.id ORDER BY units_sold DESC LIMIT 20`,
      [from_date, to_date]
    );

    const daily = await query(
      `SELECT DATE(o.created_at) as date,
              COUNT(*) as orders, SUM(o.total_paise) as revenue_paise
       FROM orders o
       WHERE o.created_at BETWEEN $1 AND $2
         AND o.status NOT IN ('pending_payment','payment_failed','cancelled')
       GROUP BY DATE(o.created_at) ORDER BY date`,
      [from_date, to_date]
    );

    res.json({ success: true, data: { top_products: topProducts, daily_summary: daily } });
  } catch (e) { next(e); }
});

reportRouter.get('/stock', authenticate, authorize('admin', 'super_admin'), async (_req, res, next) => {
  try {
    const stock = await query(
      `SELECT p.name, p.sku, p.category, p.drug_schedule,
              COALESCE(SUM(b.quantity_available),0) as total_qty,
              COALESCE(SUM(b.quantity_reserved),0) as reserved_qty,
              COALESCE(SUM(b.quantity_available - b.quantity_reserved),0) as available_qty,
              MIN(b.expiry_date) as nearest_expiry
       FROM products p
       LEFT JOIN inventory_batches b ON b.product_id = p.id AND b.is_recalled = FALSE
       WHERE p.is_active = TRUE AND p.deleted_at IS NULL
       GROUP BY p.id
       ORDER BY available_qty ASC`,
      []
    );
    res.json({ success: true, data: stock });
  } catch (e) { next(e); }
});

reportRouter.get('/refill-due', authenticate, authorize('admin', 'super_admin', 'pharmacist_rx'), async (_req, res, next) => {
  try {
    const due = await query(
      `SELECT rs.id, rs.next_refill_date, rs.frequency_days, rs.auto_charge,
              o.order_number, up.full_name as customer_name, u.mobile
       FROM refill_subscriptions rs
       JOIN orders o ON o.id = rs.order_id
       JOIN users u ON u.id = rs.user_id
       LEFT JOIN user_profiles up ON up.user_id = rs.user_id
       WHERE rs.is_active = TRUE
         AND rs.next_refill_date <= CURRENT_DATE + 3
       ORDER BY rs.next_refill_date`,
      []
    );
    res.json({ success: true, data: due });
  } catch (e) { next(e); }
});

export default couponRouter;
