// Sprint 32 C — deleting notifications while their deliveries are being written must
// not stop the API (Sprint 23 crash: unhandled rejection on
// notification_deliveries_notification_id_fkey). Orders queue notifications; a loop
// deletes the buyer's notifications as fast as they appear; the API must keep serving.
import { ORIGIN, call, check, q } from '../sprint5/lib.mjs';
import { PIN } from './fixtures.mjs';

export async function dispatch({ t, P, ids, addr }) {
  console.log('\nC. Notifications deleted mid-dispatch do not crash the API');
  let deleting = true;
  let deleted = 0;
  const loop = (async () => {
    while (deleting) {
      deleted += (await q('DELETE FROM notifications WHERE user_id = $1 RETURNING id', [ids.buyer])).length;
      await new Promise((r) => setTimeout(r, 5));
    }
  })();
  let placed = 0;
  for (let i = 0; i < 6; i++) {
    const r = await call('POST', '/orders', { token: t.buyer, body: { address_id: addr.buyer, pincode: PIN, items: [{ product_id: P.own, quantity: 1 }] } });
    if (r.status === 201) placed++;
    // cancelling queues another notification for the same buyer
    if (r.json.data?.order?.id) await call('POST', `/orders/${r.json.data.order.id}/cancel`, { token: t.buyer, body: { reason: 'S32 test' } });
  }
  // Let the queue work through them while the deletes go on
  await new Promise((r) => setTimeout(r, 4000));
  deleting = false;
  await loop;
  check('orders placed while notifications were being deleted', placed === 6, { placed });
  check('notifications were deleted under the dispatcher', deleted > 0, { deleted });
  const health = await fetch(`${ORIGIN}/health`).then((x) => x.status).catch(() => 0);
  check('the API is still up after the race', health === 200, { health });
  const r = await call('GET', '/users/me/trade-prices', { token: t.buyer });
  check('… and still answers signed-in requests', r.status === 200, r.json);
}
