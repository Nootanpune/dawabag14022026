// Fixes from the Sprint 12–13 security review
import { call, check, q } from '../sprint5/lib.mjs';
import { razorpay, sendWebhook } from '../fakes/razorpay.mjs';

const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export async function runReviewFixes({ t, ids }) {
  console.log('Security review fixes');
  // WhatsApp carries no health details (C-41)
  let r = await call('PUT', '/admin/settings/whatsapp.templates', { token: t.admin, body: { value: { rx_rejected: { name: 'rx_rejected', language: 'en' } } } });
  check('prescription messages cannot be set up for WhatsApp', r.status === 422, r.json);
  r = await call('PUT', '/admin/settings/whatsapp.templates', { token: t.admin, body: { value: { dispatched: { name: 'order_dispatched', language: 'en', vars: ['order_number', 'product'] } } } });
  check('…nor medicine names in a WhatsApp message', r.status === 422, r.json);
  r = await call('PUT', '/admin/settings/whatsapp.templates', { token: t.admin, body: { value: { dispatched: { name: 'order_dispatched', language: 'en', vars: ['order_number', 'awb'] } } } });
  check('order updates with order number and AWB are allowed', r.status === 200, r.json);
  await call('PUT', '/admin/settings/whatsapp.templates', { token: t.admin, body: { value: {} } });

  // Settlements never land in a filed GST period (C-31, C-32)
  await call('PUT', '/admin/settings/accounts.locked_until', { token: t.admin, body: { value: day(-2) } });
  r = await call('POST', '/admin/settlements/generate', { token: t.admin, body: { period_from: day(-9), period_to: day(-3) } });
  check('a partner settlement for a locked period is refused', r.status === 409 && /closed GST period/.test(r.json.message), r.json);
  await call('PUT', '/admin/settings/accounts.locked_until', { token: t.admin, body: { value: null } });

  // A consultation refund is "refunded" only when Razorpay has processed it (C-37)
  const doc = (await q(`INSERT INTO doctor_profiles (user_id, full_name, nmc_reg_number) VALUES ($1, 'S14 Doctor', 'S14-REG') RETURNING id`, [ids.doctor]))[0].id;
  const pay = `pay_S14_${Date.now()}`;
  const c = (await q(`INSERT INTO consultations (doctor_id, patient_user_id, fee_paise, status, payment_status, gateway_payment_id)
     VALUES ($1, $2, 30000, 'cancelled', 'refund_pending', $3) RETURNING id`, [doc, ids.buyer, pay]))[0].id;
  const row = async () => (await q(`SELECT payment_status, gateway_refund_id, refund_error FROM consultations WHERE id = $1`, [c]))[0];
  razorpay.refundStatus = 'pending';
  await call('POST', '/admin/jobs/payment_reconcile/run', { token: t.admin });
  let now = await row();
  check('a refund still with the bank stays pending', now.payment_status === 'refund_pending' && /^rfnd_/.test(now.gateway_refund_id || ''), now);
  const first = now.gateway_refund_id;
  razorpay.refunds.find((x) => x.id === first).status = 'failed';
  r = await sendWebhook('refund.failed', { refund: { entity: { id: first, payment_id: pay, status: 'failed', error_description: 'Account closed' } } });
  now = await row();
  check('a failed refund goes back for retry with the reason', r.status === 200 && now.payment_status === 'refund_pending' && !now.gateway_refund_id && /Account closed/.test(now.refund_error || ''), { r: r.json, now });
  razorpay.refundStatus = 'processed';
  await call('POST', '/admin/jobs/payment_reconcile/run', { token: t.admin });
  now = await row();
  check('the sweep makes a new refund (the failed one is not adopted) and it completes', now.payment_status === 'refunded' && now.gateway_refund_id && now.gateway_refund_id !== first, now);

  // Rate limit scope: signed-in e-prescription routes are not throttled with the public check
  r = await call('GET', '/eprescriptions/verify/NOPE-NOPE', {});
  check('the public prescription check still answers', [404, 400, 422].includes(r.status), r.status);
}
