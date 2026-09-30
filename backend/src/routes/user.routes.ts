import { Router } from 'express';
import { getAddresses, postAddress, postDefaultAddress, putAddress, removeAddress } from '../controllers/address.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { query, queryOne } from '../config/database';
import { AppError } from '../utils/AppError';

const router = Router();

// GET /api/v1/users/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await queryOne(
      `SELECT u.id, u.mobile, u.email, u.role, u.mobile_verified,
              u.customer_type, u.kyc_status, u.business_name,
              u.credit_limit_paise, u.credit_used_paise,
              up.full_name, up.wallet_balance_paise, up.referral_code,
              up.date_of_birth, up.gender
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = $1`,
      [req.user!.id]
    );
    if (!user) throw new AppError('User not found', 404);
    res.json({ success: true, data: user });
  } catch (e) { next(e); }
});

// PATCH /api/v1/users/me
router.patch('/me', authenticate, async (req, res, next) => {
  try {
    const allowed = ['full_name', 'date_of_birth', 'gender', 'preferred_language'];
    const updates = Object.entries(req.body)
      .filter(([k]) => allowed.includes(k))
      .reduce((a, [k, v]) => ({ ...a, [k]: v }), {} as any);

    if (Object.keys(updates).length === 0) throw new AppError('No valid fields', 400);

    const profileFields = ['full_name', 'date_of_birth', 'gender'];
    const userFields = ['preferred_language'];

    const profileUpdates = Object.entries(updates).filter(([k]) => profileFields.includes(k));
    const userUpdates = Object.entries(updates).filter(([k]) => userFields.includes(k));

    if (profileUpdates.length) {
      const setClauses = profileUpdates.map(([k], i) => `${k} = $${i + 2}`);
      await query(`UPDATE user_profiles SET ${setClauses.join(', ')} WHERE user_id = $1`,
        [req.user!.id, ...profileUpdates.map(([, v]) => v)]);
    }
    if (userUpdates.length) {
      const setClauses = userUpdates.map(([k], i) => `${k} = $${i + 2}`);
      await query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = $1`,
        [req.user!.id, ...userUpdates.map(([, v]) => v)]);
    }

    res.json({ success: true, message: 'Profile updated' });
  } catch (e) { next(e); }
});

// PATCH /api/v1/users/me/fcm-token
router.patch('/me/fcm-token', authenticate, async (req, res, next) => {
  try {
    const { fcm_token } = req.body;
    if (!fcm_token) throw new AppError('FCM token required', 400);
    await query('UPDATE users SET fcm_token = $1 WHERE id = $2', [fcm_token, req.user!.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// GET /api/v1/users/me/patients
router.get('/me/patients', authenticate, async (req, res, next) => {
  try {
    const patients = await query(
      'SELECT * FROM patients WHERE owner_user_id = $1 AND deleted_at IS NULL ORDER BY created_at',
      [req.user!.id]
    );
    res.json({ success: true, data: patients });
  } catch (e) { next(e); }
});

// POST /api/v1/users/me/patients
router.post('/me/patients', authenticate, async (req, res, next) => {
  try {
    const { full_name, date_of_birth, gender, relationship } = req.body;
    if (!full_name) throw new AppError('Patient name required', 400);
    const patient = await queryOne(
      `INSERT INTO patients (owner_user_id, full_name, date_of_birth, gender, relationship)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, full_name`,
      [req.user!.id, full_name, date_of_birth || null, gender || null, relationship || null]
    );
    res.status(201).json({ success: true, data: patient });
  } catch (e) { next(e); }
});

// Addresses — controllers/address.controller.ts
router.get('/me/addresses', authenticate, getAddresses);
router.post('/me/addresses', authenticate, postAddress);
router.put('/me/addresses/:id', authenticate, putAddress);
router.delete('/me/addresses/:id', authenticate, removeAddress);
router.post('/me/addresses/:id/default', authenticate, postDefaultAddress);

// GET /api/v1/users/me/wallet
router.get('/me/wallet', authenticate, async (req, res, next) => {
  try {
    const profile = await queryOne<{ wallet_balance_paise: number }>(
      'SELECT wallet_balance_paise FROM user_profiles WHERE user_id = $1',
      [req.user!.id]
    );
    const transactions = await query(
      `SELECT type, amount_paise, reason, expires_at, created_at
       FROM wallet_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.user!.id]
    );
    res.json({ success: true, data: { balance_paise: profile?.wallet_balance_paise || 0, transactions } });
  } catch (e) { next(e); }
});

// GET /api/v1/users/me/notifications
router.get('/me/notifications', authenticate, async (req, res, next) => {
  try {
    const notifications = await query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY sent_at DESC LIMIT 30',
      [req.user!.id]
    );
    res.json({ success: true, data: notifications });
  } catch (e) { next(e); }
});

// PATCH /api/v1/users/me/notifications/:id/read
router.patch('/me/notifications/:id/read', authenticate, async (req, res, next) => {
  try {
    await query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [req.params.id, req.user!.id]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

export default router;
