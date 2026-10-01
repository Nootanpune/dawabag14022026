// src/jobs/expiryWatch.job.ts — daily: expired stock is raised for write-off (a
// person still approves it and records its destruction) and admins get the
// near-expiry list. Expired batches are already never sold (allocation filter).
import { query, withTransaction } from '../config/database';
import { createAdjustment } from '../services/stock/adjustment.service';
import { getSetting } from '../services/settings.service';
import { queueNotification } from '../services/notification.service';

export async function runExpiryWatchJob() {
  const expired = await query<{ id: string; free: number }>(
    `SELECT b.id, (b.quantity_available - b.quantity_reserved) AS free FROM inventory_batches b
     WHERE b.expiry_date <= CURRENT_DATE AND b.quantity_available - b.quantity_reserved > 0
       AND NOT EXISTS (SELECT 1 FROM stock_adjustments a WHERE a.batch_id = b.id AND a.reason = 'expired' AND a.status <> 'rejected')`);
  for (const b of expired) {
    await withTransaction((client) => createAdjustment(client, null, { batch_id: b.id, quantity_delta: -Number(b.free), reason: 'expired',
      notes: 'Raised automatically: batch has expired' }));
  }
  const near = Number(await getSetting('stock.near_expiry_days', 90));
  const soon = (await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM inventory_batches WHERE quantity_available > 0 AND expiry_date > CURRENT_DATE AND expiry_date <= CURRENT_DATE + $1::int`, [near]))[0].n;
  if (expired.length || soon) {
    const admins = await query<{ id: string }>(`SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND is_active AND deleted_at IS NULL`);
    for (const a of admins) await queueNotification({ userId: a.id, type: 'expiry_watch', expired: expired.length, nearExpiry: soon, days: near });
  }
  return { expired_raised: expired.length, near_expiry_batches: soon };
}
