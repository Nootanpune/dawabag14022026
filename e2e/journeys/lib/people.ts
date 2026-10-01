// The extra staff for the journeys (packer, rider) and the pharmacist's council
// registration. Mobiles stay in the 90000019xx test range so the usual clean-up removes them.
import { call, db, people, redis } from '../../support/data';

export const staff = {
  packer: { customer_type: 'customer', full_name: 'Journey Packer', mobile: '9000001904', password: 'Passw0rd!', accept_privacy_notice: true, age_confirmed: true },
  rider: { customer_type: 'customer', full_name: 'Journey Rider', mobile: '9000001905', password: 'Passw0rd!', accept_privacy_notice: true, age_confirmed: true },
};
export const everyone = { ...people, ...staff };

export const token = async (who: keyof typeof everyone) =>
  (await call('POST', '/auth/login', { mobile: everyone[who].mobile, password: everyone[who].password })).json.data?.access_token as string;

export async function setUpStaff() {
  const c = db(); const r = redis();
  await c.connect();
  try {
    for (const p of Object.values(staff)) {
      await call('POST', '/auth/register', p);
      const v = await call('POST', '/auth/verify-otp', { mobile: p.mobile, otp: await r.get(`otp:${p.mobile}`) });
      if (v.status >= 300) throw new Error(`Could not register ${p.mobile}: ${JSON.stringify(v.json)}`);
    }
    await c.query(`UPDATE users SET role = 'pharmacist_pack' WHERE mobile = $1`, [staff.packer.mobile]);
    await c.query(`UPDATE users SET role = 'delivery' WHERE mobile = $1`, [staff.rider.mobile]);
    const ph = (await c.query('SELECT id FROM users WHERE mobile = $1', [people.pharmacist.mobile])).rows[0].id;
    const res = await call('PATCH', `/admin/users/${ph}/pharmacist`, { pharmacist_reg_no: 'MSPC-2019-0419' }, await token('admin'));
    if (res.status >= 300) throw new Error(`Pharmacist registration: ${JSON.stringify(res.json)}`);
  } finally { await c.end(); r.disconnect(); }
}
