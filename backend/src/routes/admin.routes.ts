import { setPharmacistRegistration } from '../controllers/fulfilment.controller';
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { query, queryOne } from '../config/database';
import { AppError } from '../utils/AppError';
import { listOpenCredit, setCreditLimit } from '../controllers/credit.controller';
import { listJobs, runJobNow } from '../controllers/jobs.controller';
import {
  getSettings, getSettlementDetail, getSettlements, linkPartnerUser, listPartners, postGenerateSettlements,
  postSettlementPaid, postShipmentDelivered, putSetting, setCommission,
} from '../controllers/marketplaceAdmin.controller';

const router = Router();

// ─── Admin Dashboard Stats ────────────────────────────────────────────────────
router.get('/stats', authenticate, authorize('admin', 'super_admin'), async (_req, res, next) => {
  try {
    const [orders, revenue, pendingRx, lowStock, users] = await Promise.all([
      queryOne<{ count: string }>(`SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURRENT_DATE AND deleted_at IS NULL`, []),
      queryOne<{ sum: string }>(`SELECT COALESCE(SUM(total_paise),0) as sum FROM orders WHERE DATE(created_at) = CURRENT_DATE AND status NOT IN ('pending_payment','payment_failed','cancelled')`, []),
      queryOne<{ count: string }>(`SELECT COUNT(*) FROM orders WHERE status = 'rx_pending'`, []),
      queryOne<{ count: string }>(`SELECT COUNT(*) FROM products p WHERE is_active=TRUE AND (SELECT COALESCE(SUM(quantity_available-quantity_reserved),0) FROM inventory_batches WHERE product_id=p.id) < 20`, []),
      queryOne<{ count: string }>(`SELECT COUNT(*) FROM users WHERE DATE(created_at) = CURRENT_DATE AND deleted_at IS NULL`, []),
    ]);

    const pipeline = await query(
      `SELECT status, COUNT(*) as count FROM orders WHERE deleted_at IS NULL GROUP BY status`,
      []
    );

    res.json({
      success: true,
      data: {
        today_orders: parseInt(orders?.count || '0'),
        today_revenue_paise: parseInt(revenue?.sum || '0'),
        pending_rx: parseInt(pendingRx?.count || '0'),
        low_stock_items: parseInt(lowStock?.count || '0'),
        new_users_today: parseInt(users?.count || '0'),
        pipeline: pipeline.reduce((acc: any, row: any) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {}),
      },
    });
  } catch (e) { next(e); }
});

// ─── Admin Users ──────────────────────────────────────────────────────────────
router.get('/users', authenticate, authorize('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { role, search, page = '1' } = req.query;
    const limit = 20;
    const offset = (parseInt(page as string) - 1) * limit;

    const conditions: string[] = ['u.deleted_at IS NULL'];
    const params: any[] = [];
    let idx = 1;

    if (role) { conditions.push(`u.role = $${idx++}`); params.push(role); }
    if (search) {
      conditions.push(`(u.mobile ILIKE $${idx} OR up.full_name ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }

    const users = await query(
      `SELECT u.id, u.mobile, u.email, u.role, u.is_active, u.mobile_verified,
              u.created_at, up.full_name
       FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    res.json({ success: true, data: users });
  } catch (e) { next(e); }
});

router.patch('/users/:userId/status', authenticate, authorize('super_admin'), async (req, res, next) => {
  try {
    const { is_active } = req.body;
    await query('UPDATE users SET is_active = $1 WHERE id = $2', [is_active, req.params.userId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ─── Sprint 2: credit accounts and scheduled jobs ────────────────────────────
router.patch('/users/:userId/credit', authenticate, authorize('admin', 'super_admin'), setCreditLimit);
router.get('/credit/open', authenticate, authorize('admin', 'super_admin'), listOpenCredit);
router.get('/jobs', authenticate, authorize('admin', 'super_admin'), listJobs);
router.post('/jobs/:name/run', authenticate, authorize('super_admin'), runJobNow);

// ─── Sprint 3: marketplace, settlements, settings ───────────────────────────
const managers = authorize('admin', 'super_admin');
router.get('/partners', authenticate, managers, listPartners);
router.post('/partners/:vendorId/users', authenticate, managers, linkPartnerUser);
router.put('/partners/:vendorId/commission', authenticate, managers, setCommission);
router.post('/shipments/:id/delivered', authenticate, managers, postShipmentDelivered);
router.get('/settlements', authenticate, managers, getSettlements);
router.post('/settlements/generate', authenticate, managers, postGenerateSettlements);
router.get('/settlements/:id', authenticate, managers, getSettlementDetail);
router.post('/settlements/:id/pay', authenticate, managers, postSettlementPaid);
router.get('/settings', authenticate, managers, getSettings);
router.put('/settings/:key', authenticate, authorize('super_admin'), putSetting);
router.patch('/users/:userId/pharmacist', authenticate, authorize('admin', 'super_admin'), setPharmacistRegistration);

export default router;
