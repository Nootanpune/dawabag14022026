import { call, cleanup, db, people, PIN, redis } from './data';

export default async function globalSetup() {
  const c = db(); const r = redis();
  await c.connect();
  try {
    await cleanup(c);
    await c.query(`INSERT INTO pincode_serviceability (pincode, city, state, latitude, longitude, dawabag_delivery_hours, estimated_days)
                   VALUES ($1, 'Nashik', 'Maharashtra', 20.01, 73.79, 12, 1)`, [PIN]);
    for (const p of Object.values(people)) {
      await call('POST', '/auth/register', p);
      const otp = await r.get(`otp:${p.mobile}`);
      const v = await call('POST', '/auth/verify-otp', { mobile: p.mobile, otp });
      if (v.status >= 300) throw new Error(`Could not register ${p.mobile}: ${JSON.stringify(v.json)}`);
    }
    await c.query(`UPDATE users SET role = 'super_admin' WHERE mobile = $1`, [people.admin.mobile]);
    await c.query(`UPDATE users SET role = 'pharmacist_rx' WHERE mobile = $1`, [people.pharmacist.mobile]);
    await c.query(`INSERT INTO addresses (user_id, full_name, mobile, address_line1, city, state, pincode, is_default)
                   SELECT id, 'E2E Buyer', '9000001999', '19 Lake Road', 'Nashik', 'Maharashtra', $2, TRUE FROM users WHERE mobile = $1`,
                   [people.buyer.mobile, PIN]);
    const token = (await call('POST', '/auth/login', { mobile: people.admin.mobile, password: people.admin.password })).json.data?.access_token;
    const product = await call('POST', '/products', {
      name: 'E2E Paracetamol 500', sku: 'E2E-PARA', category: 'Pain relief', drug_schedule: 'OTC', gst_rate: 12, hsn_code: '30049099',
      mrp_paise: 4500, offer_price_paise: 4000, max_qty_per_order: 10, net_quantity: '15 tablets',
      manufacturer_name: 'E2E Pharma Ltd', manufacturer_address: 'Plot 19, MIDC Satpur, Nashik 422007', country_of_origin: 'India',
    }, token);
    if (product.status !== 201) throw new Error(`Could not create the test product: ${JSON.stringify(product.json)}`);
    await c.query(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
                   VALUES ($1, 'E2E-B1', 200, 2500, CURRENT_DATE + 500)`, [product.json.data.id]);
    process.env.E2E_PRODUCT_ID = product.json.data.id;
    const rx = await call('POST', '/products', {
      name: 'E2E Amoxicillin 500', sku: 'E2E-AMOX', category: 'Antibiotics', drug_schedule: 'Schedule H', gst_rate: 12, hsn_code: '30042019',
      mrp_paise: 9000, offer_price_paise: 8500, max_qty_per_order: 5, net_quantity: '10 capsules',
      manufacturer_name: 'E2E Pharma Ltd', manufacturer_address: 'Plot 19, MIDC Satpur, Nashik 422007', country_of_origin: 'India',
    }, token);
    if (rx.status !== 201) throw new Error(`Could not create the prescription test product: ${JSON.stringify(rx.json)}`);
    await c.query(`INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date)
                   VALUES ($1, 'E2E-B2', 100, 5000, CURRENT_DATE + 500)`, [rx.json.data.id]);
    process.env.E2E_RX_PRODUCT_ID = rx.json.data.id;
  } finally { await c.end(); r.disconnect(); }
}
