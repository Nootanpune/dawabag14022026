// Sprint 33 — product page: all substitutes (same medicine, other makers; a list only — C-08, C-10),
// "Get it by …" for the buyer's PIN, "Expires on or after …" from the batch FEFO would supply (C-27),
// and the cold-chain note (C-25).
import { call, check, q } from '../sprint5/lib.mjs';
import { P, PIN, PIN_NO_COLD, PIN_OFF, t } from './fixtures.mjs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function runSubstitutes() {
  console.log('\nSubstitutes');
  let r = await call('GET', `/medicines/${P.current}/substitutes`);
  const subs = r.json.data?.substitutes ?? [];
  const order = subs.map((s) => s.id);
  check('same medicine from other makers, cheapest per tablet first', r.status === 200
    && JSON.stringify(order) === JSON.stringify([P.cheapOut, P.perTab, P.dear]), subs.map((s) => s.name));
  check('never another strength, release type, form, an inactive product or the product itself',
    ![P.strength, P.release, P.syrup, P.inactive, P.current].some((x) => order.includes(x)), order);
  check('“save X%” per tablet against this product (66 %, 33 %, none for the dearer one)',
    JSON.stringify(subs.map((s) => s.save_pct)) === '[66,33,null]' && subs[1]?.per_unit_paise === 200 && subs[1]?.unit_label === 'per tablet', subs);
  check('out-of-stock substitute listed, marked out of stock', subs[0]?.in_stock === false && subs[1]?.in_stock === true, subs.map((s) => s.in_stock));
  check('the note and the consult link come with it', r.json.data?.note === 'Same medicine, different maker. Ask your doctor or pharmacist before switching.'
    && r.json.data.consult_href === '/consult' && r.json.data.total === 3, r.json.data);
  check('the current product’s own price per tablet is given', r.json.data?.product?.per_unit_paise === 300, r.json.data?.product);
  r = await call('GET', `/medicines/${P.current}/substitutes?limit=1`);
  check('the product page asks for the top few; total still counts all', r.json.data?.substitutes?.length === 1 && r.json.data.total === 3, r.json.data);
  r = await call('GET', `/medicines/${P.eye}/substitutes`);
  check('eye drops never list ear drops of the same salt', r.status === 200 && r.json.data?.total === 0, r.json.data);
  r = await call('GET', `/medicines/${P.inactive}/substitutes`);
  check('no substitutes page for a product that is not on sale', r.status === 404, r.status);
  const cart = await q('SELECT COUNT(*)::int AS n FROM cart_items WHERE user_id = (SELECT id FROM users WHERE mobile = $1)', ['9000003305']);
  check('nothing was put in or swapped in any cart', cart[0].n === 0, cart);
}

export async function runDeliveryAndExpiry() {
  console.log('\nDelivery date for the buyer’s PIN (estimated)');
  let r = await call('GET', `/medicines/${P.current}/delivery`);
  check('no PIN and not signed in → asks for a PIN', r.status === 200 && r.json.data?.needs_pincode === true, r.json.data);
  r = await call('GET', `/medicines/${P.current}/delivery?pincode=12ab`);
  check('a bad PIN is refused in plain words', r.status === 400 && /6-digit PIN/.test(r.json.message), r.json);
  r = await call('GET', `/medicines/${P.current}/delivery?pincode=${PIN}`);
  const d = r.json.data ?? {};
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  check('serviceable PIN: “Get it by <weekday>, <date>”, marked estimated', r.status === 200 && d.serviceable === true && d.estimated === true
    && /^Get it by (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), \d{1,2} [A-Z][a-z]{2}$/.test(d.label) && d.deliver_by > today
    && /^Estimated/.test(d.message), d);
  check('Dawabag delivers here in 24 h: tomorrow or the day after (cut-off), never a Sunday',
    (Date.parse(d.deliver_by) - Date.parse(today)) / 86_400_000 <= 3 && new Date(`${d.deliver_by}T00:00:00Z`).getUTCDay() !== 0, d.deliver_by);
  r = await call('GET', `/medicines/${P.rx}/delivery?pincode=${PIN}`);
  check('a prescription medicine allows a day for the pharmacist’s check (never earlier)', !!r.json.data?.deliver_by
    && r.json.data.deliver_by >= d.deliver_by, [d.deliver_by, r.json.data?.deliver_by]);
  r = await call('GET', `/medicines/${P.current}/delivery`, { token: t.buyer });
  check('signed in: the PIN of the saved default address is used', r.json.data?.pincode === PIN && r.json.data.pincode_source === 'saved_address', r.json.data);
  r = await call('GET', `/medicines/${P.current}/delivery?pincode=${PIN_OFF}`);
  check('PIN not served → said plainly, no date', r.json.data?.serviceable === false && r.json.data.deliver_by === null
    && /do not deliver/.test(r.json.data.message), r.json.data);
  r = await call('GET', `/medicines/${P.cold}/delivery?pincode=${PIN_NO_COLD}`);
  check('a cold-chain medicine to a PIN without cold-chain delivery → no date, says why (C-25)', r.json.data?.deliver_by === null
    && /cold-chain/.test(r.json.data.message), r.json.data);
  r = await call('GET', `/medicines/${P.cheapOut}/delivery?pincode=${PIN}`);
  check('out of stock → no date', r.json.data?.deliver_by === null && /Out of stock/.test(r.json.data.message), r.json.data);

  console.log('\nExpiry and cold chain on the product page');
  const [{ exp }] = await q(`SELECT to_char(expiry_date, 'YYYY-MM') AS exp FROM inventory_batches WHERE product_id = $1 AND batch_number = 'S33-B1'`, [P.current]);
  const want = `${MONTHS[Number(exp.slice(5, 7)) - 1]} ${exp.slice(0, 4)}`;
  r = await call('GET', `/products/${P.current}`);
  check(`“Expires on or after ${want}”: the batch FEFO supplies, not the one with 20 days left`, r.json.data?.expires_on_or_after === want, r.json.data?.expires_on_or_after);
  check('no cold-chain note on an ordinary tablet', r.json.data?.cold_chain_note === null, r.json.data?.cold_chain_note);
  r = await call('GET', `/products/${P.cold}`);
  check('2–8 °C product: insulated-pack note (C-25)', r.json.data?.cold_chain_note === 'Delivered in an insulated pack. Keep refrigerated on arrival.', r.json.data);
  r = await call('GET', `/products/${P.cheapOut}`);
  check('no stock → no expiry line', r.json.data?.expires_on_or_after === null, r.json.data?.expires_on_or_after);
}
