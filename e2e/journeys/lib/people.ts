// The extra people for the journeys: packer and rider (staff), and the doctor and
// the partner pharmacy's owner, who register as ordinary accounts and are turned
// into a doctor (C-22) and a partner login by the admin on screen. Mobiles stay in
// the 90000019xx test range so the usual clean-up removes them.
import { call, db, people, redis } from '../../support/data';

const account = (full_name: string, mobile: string) =>
  ({ customer_type: 'customer', full_name, mobile, password: 'Passw0rd!', accept_privacy_notice: true, age_confirmed: true });

export const staff = {
  packer: account('Journey Packer', '9000001904'),
  rider: account('Journey Rider', '9000001905'),
  doctor: account('Meera Joshi', '9000001906'),
  partner: account('Journey Partner Owner', '9000001907'),
  // Sprint 35: forgets the password and resets it with a code (a separate account, so the others keep theirs)
  forgetful: account('Journey Forgetful', '9000001908'),
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
    // Sprint 39 (C-03): the council registration on record follows the number, verified as an admin does
    await c.query(`UPDATE pharmacist_registrations SET registration_no = 'MSPC-2019-0419', verified_at = NOW() WHERE user_id = $1`, [ph]);
  } finally { await c.end(); r.disconnect(); }
}

/** An API call as one of the people, for steps the screen could not do; throws on an error answer */
export async function apiAs(who: keyof typeof everyone, method: string, path: string, body?: unknown) {
  const r = await call(method, path, body, await token(who));
  if (r.status >= 300) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
  return r.json.data;
}
