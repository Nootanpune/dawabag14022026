// src/jobs/creditReminders.job.ts — daily reminders for open credit orders
// Sends at 3 days before, 1 day before and on the due date; one per order per
// stage (credit_reminders). SMS + email via the notification queue. WhatsApp
// needs a WhatsApp Business provider and is not wired yet.
import { query } from '../config/database';
import { queueNotification } from '../services/notification.service';
import { formatDateIST } from '../utils/ist';

const STAGES = [3, 1, 0];

export async function runCreditRemindersJob() {
  const due = await query<{ id: string; user_id: string; order_number: string; total_paise: number; credit_due_date: string; days_before: number }>(
    `SELECT o.id, o.user_id, o.order_number, o.total_paise, o.credit_due_date,
            (o.credit_due_date - CURRENT_DATE) AS days_before
     FROM orders o
     WHERE o.credit_due_date IS NOT NULL
       AND o.credit_settled_at IS NULL
       AND o.status NOT IN ('cancelled', 'returned')
       AND (o.credit_due_date - CURRENT_DATE) = ANY($1::int[])
       AND NOT EXISTS (
         SELECT 1 FROM credit_reminders r
         WHERE r.order_id = o.id AND r.days_before = (o.credit_due_date - CURRENT_DATE)
       )`,
    [STAGES]
  );

  let sent = 0;
  for (const o of due) {
    // Record first: a retry of this job must not send the same reminder twice
    const inserted = await query(
      `INSERT INTO credit_reminders (order_id, days_before) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING id`,
      [o.id, o.days_before]
    );
    if (!inserted.length) continue;
    sent++;
    await queueNotification({
      userId: o.user_id, type: 'credit_due',
      orderId: o.id, orderNumber: o.order_number,
      amountPaise: o.total_paise, daysBefore: o.days_before,
      dueDate: formatDateIST(o.credit_due_date),
    });
  }
  return { reminders_sent: sent };
}
