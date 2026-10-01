// src/controllers/device.controller.ts — push devices (several per user) and the
// admin view of notification deliveries
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../config/database';

const tokenSchema = z.string().trim().min(20).max(4096);

// POST /users/me/devices { token, platform } — also PATCH /users/me/fcm-token { fcm_token } (older apps)
export async function postDevice(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ token: tokenSchema, platform: z.enum(['android', 'ios', 'web']).optional() })
      .parse({ token: req.body.token ?? req.body.fcm_token, platform: req.body.platform });
    // A token belongs to one device. It moves to this account only when the other
    // account has not used it for a day (a shared phone signing in to someone else);
    // otherwise a known token could be used to take another person's pushes.
    const r = await query(
      `INSERT INTO user_devices (user_id, fcm_token, platform) VALUES ($1, $2, $3)
       ON CONFLICT (fcm_token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = COALESCE(EXCLUDED.platform, user_devices.platform), last_seen_at = NOW()
       WHERE user_devices.user_id = EXCLUDED.user_id OR user_devices.last_seen_at < NOW() - INTERVAL '1 day'
       RETURNING id`,
      [req.user!.id, d.token, d.platform ?? null]);
    if (!r.length) return res.status(409).json({ success: false, message: 'This device is registered to another account; sign out there first' });
    res.json({ success: true });
  } catch (e) { next(e); }
}

export async function deleteDevice(req: Request, res: Response, next: NextFunction) {
  try {
    const token = tokenSchema.parse(req.body.token);
    await query('DELETE FROM user_devices WHERE user_id = $1 AND fcm_token = $2', [req.user!.id, token]);
    res.json({ success: true });
  } catch (e) { next(e); }
}

// GET /admin/notification-deliveries?status=failed|skipped|sent&channel=
export async function getDeliveries(req: Request, res: Response, next: NextFunction) {
  try {
    const f = z.object({ status: z.enum(['sent', 'failed', 'skipped']).optional(), channel: z.enum(['sms', 'email', 'push']).optional() }).parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (f.status) { params.push(f.status); where.push(`d.status = $${params.length}`); }
    if (f.channel) { params.push(f.channel); where.push(`d.channel = $${params.length}`); }
    const rows = await query(
      `SELECT d.id, d.type, d.channel, d.status, d.provider_ref, d.detail, d.created_at, up.full_name AS user_name
       FROM notification_deliveries d LEFT JOIN user_profiles up ON up.user_id = d.user_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.created_at DESC LIMIT 300`, params);
    const summary = await query(
      `SELECT channel, status, COUNT(*)::int AS n FROM notification_deliveries WHERE created_at > NOW() - INTERVAL '7 days'
       GROUP BY channel, status ORDER BY channel, status`);
    res.json({ success: true, data: { deliveries: rows, last_7_days: summary } });
  } catch (e) { next(e); }
}
