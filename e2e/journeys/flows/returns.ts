// Returns and refunds (C-37): the buyer reports a damaged item on the delivered
// everyday-medicine order, the pharmacist approves it, a credit note is issued and
// the refund goes back through Razorpay (the fake holds it, then settles it with
// the signed refund.processed webhook), the returned pack is recorded as
// destroyed — never restocked — and the buyer sees the money back.
import { Browser } from '@playwright/test';
import { shooter } from '../lib/recorder';
import { holdGatewayRefunds, settleGatewayRefund } from '../lib/fakes';
import { apiAs } from '../lib/people';
import { dialog, newSession, onScreenOr, signIn } from '../lib/steps';
import { dbRow, orderIdOf, shipmentsOf } from '../lib/orders';
import type { Story } from '../lib/story';

const RET = 'Returns and refunds';
const PROBLEM = 'The strip was crushed in transit and two tablets are broken.';

export async function returnsAndRefunds(browser: Browser, story: Story) {
  const orderNo = story.orders.otc!;
  const orderId = await orderIdOf(orderNo);
  const returnOf = async () => (await dbRow(`SELECT id, return_no FROM return_requests WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [orderId]))!;

  // ── The buyer reports the problem on the phone ──
  const buyer = await newSession(browser, 'phone');
  const buyerShot = shooter(buyer.page, RET, 'Customer', 'phone');
  await signIn(buyer.page, 'buyer');
  await buyer.page.goto(`/orders/${orderId}`);
  await buyer.page.getByRole('button', { name: 'Report a problem / return' }).waitFor();
  await buyerShot('Delivered order', `Order ${orderNo} was delivered. Each delivered shipment has "Report a problem / return".`, { fullPage: true });
  let note = await onScreenOr(async () => {
    await buyer.page.getByRole('button', { name: 'Report a problem / return' }).click();
    const d = dialog(buyer.page);
    await d.locator('select').selectOption('damaged');
    await d.locator('input[type=number]').first().fill('1');
    await d.locator('textarea').fill(PROBLEM);
    await buyerShot('Report the problem', 'The buyer picks what went wrong, the item and quantity, and describes it. Damaged, wrong or missing items must be reported within 48 hours of delivery (C-37).');
    await d.getByRole('button', { name: 'Submit' }).click();
    await buyer.page.waitForURL(/\/account\/returns\/.+/);
  }, async () => {
    const [sid] = await shipmentsOf(orderNo);
    const item = await dbRow(`SELECT id FROM order_items WHERE order_id = $1 LIMIT 1`, [orderId]);
    const r = await apiAs('buyer', 'POST', '/returns', { shipment_id: sid, reason: 'damaged', description: PROBLEM, items: [{ order_item_id: item.id, quantity: 1 }] });
    await buyer.page.goto(`/account/returns/${r.id}`);
  }, buyer.page);
  const ret = await returnOf();
  await buyerShot('Return raised', `Return ${ret.return_no} is waiting for Dawabag's decision, with the batch and expiry of what is being returned.`, { fullPage: true, note });

  // Real refunds take a few days at the bank: the fake Razorpay holds this one until it is settled below
  await holdGatewayRefunds(true);

  // ── The pharmacist decides on the laptop ──
  const staffS = await newSession(browser, 'laptop');
  const staffShot = shooter(staffS.page, RET, 'Staff', 'laptop');
  await signIn(staffS.page, 'pharmacist');
  await staffS.page.goto('/staff/returns');
  await staffS.page.getByRole('link', { name: ret.return_no }).waitFor();
  await staffShot('Returns to decide', 'The pharmacist\'s returns queue: reason, seller, buyer and the refund due.');
  await staffS.page.getByRole('link', { name: ret.return_no }).click();
  await staffS.page.getByText(PROBLEM).waitFor();
  note = await onScreenOr(async () => {
    await staffS.page.getByRole('button', { name: 'Approve', exact: true }).click();
    await dialog(staffS.page).locator('textarea').fill('Sorry about the damaged strip. Approved: the full price of the item is being refunded to your original payment method.');
    await staffShot('Approve the return', 'Approving issues a credit note in the seller\'s series and refunds the buyer; the delivery charge is not refunded for a single item (C-37).');
    await dialog(staffS.page).getByRole('button', { name: 'Approve & refund' }).click();
    await dialog(staffS.page).waitFor({ state: 'detached' });
  }, () => apiAs('pharmacist', 'POST', `/returns/${ret.id}/decide`, { approve: true, notes: 'Damaged in transit: approved' }), staffS.page);
  await staffS.page.reload();
  await staffS.page.getByText(/Credit note/).first().waitFor();
  await staffShot('Approved', 'Approved: the credit note number and the refund, which has gone to Razorpay and is waiting there.', { fullPage: true, note });
  await staffS.ctx.close();

  // ── Accounts sees the refund at Razorpay, then settled by the webhook ──
  const admin = await newSession(browser, 'laptop');
  const adminShot = shooter(admin.page, RET, 'Admin', 'laptop');
  await signIn(admin.page, 'admin');
  await admin.page.goto('/admin/refunds');
  await adminShot('Refund with Razorpay', 'Gateway refunds are sent to Razorpay automatically and show as pending until Razorpay confirms them. A refused one can be retried or paid by bank transfer.');
  const refund = (await dbRow(`SELECT gateway_refund_id FROM refunds WHERE return_id = $1 AND gateway_refund_id IS NOT NULL`, [ret.id]))!;
  await settleGatewayRefund(refund.gateway_refund_id);
  await holdGatewayRefunds(false);
  await admin.page.getByRole('button', { name: 'Processed', exact: true }).click();
  await adminShot('Refund confirmed', 'Razorpay\'s signed confirmation (webhook) marks the refund processed; nobody has to update it by hand.');
  await admin.ctx.close();

  // ── The packer records what happened to the returned pack ──
  const packer = await newSession(browser, 'laptop');
  const packerShot = shooter(packer.page, RET, 'Staff', 'laptop');
  await signIn(packer.page, 'packer');
  await packer.page.goto(`/staff/returns/${ret.id}`);
  note = await onScreenOr(async () => {
    await packer.page.getByRole('button', { name: 'Record disposition & close' }).click();
    await dialog(packer.page).getByLabel('Destroyed').check();
    await packerShot('Dispose of the returned pack', 'When the pack comes back it is destroyed or sent back to the supplier, and that is recorded. Returned medicines are never put back on sale.');
    await dialog(packer.page).getByRole('button', { name: 'Close return' }).click();
    await dialog(packer.page).waitFor({ state: 'detached' });
  }, () => apiAs('packer', 'POST', `/returns/${ret.id}/close`, { disposition: 'destroyed' }), packer.page);
  await packer.page.reload();
  await packerShot('Return closed', 'Closed, with the disposition on record.', { note });
  await packer.ctx.close();

  // ── The buyer sees the money back ──
  await buyer.page.goto(`/account/returns/${ret.id}`);
  await buyerShot('Refund received', 'The return shows the decision note, the credit note and the refund to the original payment method.', { fullPage: true });
  await buyer.page.goto(`/orders/${orderId}`);
  await buyerShot('Order after the return', 'The order page lists the return, the refund and the credit note, which can be downloaded as a PDF.', { fullPage: true });
  await buyer.ctx.close();
}
