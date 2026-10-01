// Teleconsultation under the Telemedicine Practice Guidelines 2020 (C-22, C-23, C-24)
import { call, check, db, q } from '../sprint5/lib.mjs';
import { checkoutPayment, razorpay } from '../fakes/razorpay.mjs';
import { istSlot, login, people } from './fixtures.mjs';

export async function runTelemedicine(ctx) {
  const { t, P, ids } = ctx;
  const profile = { full_name: 'Dr S10 Doctor', qualification: 'MBBS, MD (Medicine)', council: 'Maharashtra Medical Council',
    nmc_reg_number: 'MMC-2011-0042', registration_year: 2011, speciality: 'General Medicine', consultation_fee_paise: 30000 };

  console.log('Doctors and their registration (C-22)');
  let r = await call('PUT', '/doctors/me/profile', { token: t.doctor, body: profile });
  check('an ordinary account cannot act as a doctor', r.status === 403, r.status);
  r = await call('POST', '/doctors/admin/enable', { token: t.admin, body: { mobile: people.doctor.mobile } });
  await call('POST', '/doctors/admin/enable', { token: t.admin, body: { mobile: people.doctor2.mobile } });
  check('admin enables the account for teleconsultation', r.status === 200 && r.json.data.role === 'doctor', r.json);
  t.doctor = await login(people.doctor); t.doctor2 = await login(people.doctor2);
  r = await call('PUT', '/doctors/me/profile', { token: t.doctor, body: { ...profile, registration_year: 1900 } });
  check('registration details are validated', r.status === 422, r.status);
  r = await call('PUT', '/doctors/me/profile', { token: t.doctor, body: profile });
  check('doctor saves registration; waits for checking', r.status === 200 && r.json.data.is_verified === false, r.json);
  await call('PUT', '/doctors/me/profile', { token: t.doctor2, body: { ...profile, full_name: 'Dr Unchecked', nmc_reg_number: 'MMC-2015-0099' } });
  const docId = r.json.data.id;
  r = await call('GET', '/doctors');
  check('unverified doctors are not listed to patients', !r.json.data.some((d) => d.id === docId), r.json.data.length);
  r = await call('POST', '/doctors/me/slots', { token: t.doctor, body: { slots: [istSlot(60)] } });
  check('an unverified doctor cannot open slots', r.status === 403, r.json);
  r = await call('POST', `/doctors/${docId}/verify`, { token: t.doctor, body: { approve: true, notes: 'self' } });
  check('a doctor cannot verify anyone', r.status === 403, r.status);
  r = await call('POST', `/doctors/${docId}/verify`, { token: t.admin, body: { approve: true, notes: 'Checked on the MMC register' } });
  check('admin verifies against the council register', r.json.data?.is_verified === true, r.json);
  r = await call('GET', '/doctors');
  const listed = r.json.data.find((d) => d.id === docId);
  check('patients see the council and registration number', listed?.council === profile.council && listed?.nmc_reg_number === profile.nmc_reg_number, listed);
  await call('PUT', '/doctors/me/profile', { token: t.doctor, body: { ...profile, nmc_reg_number: 'MMC-2011-0043' } });
  r = await call('GET', `/doctors/${docId}`);
  check('changing the registration number needs checking again', r.status === 404, r.status);
  await call('PUT', '/doctors/me/profile', { token: t.doctor, body: profile });
  await call('POST', `/doctors/${docId}/verify`, { token: t.admin, body: { approve: true, notes: 'Rechecked' } });
  r = await call('GET', '/doctors/admin/list?status=pending', { token: t.admin });
  check('admin queue lists doctors awaiting checking', r.json.data?.doctors?.some((d) => d.full_name === 'Dr Unchecked'), r.json.data);

  const S = { now1: istSlot(5), now2: istSlot(10), now3: istSlot(20), later: istSlot(180), tomorrow: istSlot(24 * 60) };
  r = await call('POST', '/doctors/me/slots', { token: t.doctor, body: { slots: [...Object.values(S), S.now1] } });
  check('doctor opens slots; duplicates skipped', r.status === 201 && r.json.data.added === 5 && r.json.data.skipped === 1, r.json);
  r = await call('POST', '/doctors/me/slots', { token: t.doctor, body: { slots: [{ ...S.later, slot_end: S.later.slot_start }] } });
  check('a slot must end after it starts', r.status === 400, r.json);
  const slots = {};
  for (const [k, s] of Object.entries(S)) {
    const day = (await call('GET', `/doctors/${docId}/slots?date=${s.slot_date}`)).json.data;
    slots[k] = day.find((x) => x.slot_start.startsWith(s.slot_start))?.id;
  }

  console.log('Booking, consent and the fee');
  const book = (token, slot, extra = {}) => call('POST', '/consultations/book', { token, body: { doctor_id: docId, slot_id: slot, mode: 'video',
    chief_complaint: 'Fever and sore throat for 2 days', consent: true, ...extra } });
  r = await book(t.patient, slots.now1, { consent: false });
  check('teleconsultation needs the patient\'s consent', r.status === 422, r.status);
  r = await book(t.doctor, slots.now1);
  check('doctors cannot book as patients', r.status === 403, r.status);
  r = await book(t.patient, slots.now1);
  const c1 = r.json.data;
  check('patient books a first video consultation', r.status === 201 && c1.consult_kind === 'first' && c1.payment_status === 'unpaid' && c1.fee_paise === 30000, r.json);
  r = await book(t.patient2, slots.now1);
  check('a booked slot cannot be booked again', r.status === 409, r.json);
  r = await call('GET', `/consultations/${c1.id}/join`, { token: t.patient });
  check('cannot join before paying', r.status === 402, r.json);
  r = await call('POST', `/consultations/${c1.id}/pay`, { token: t.patient });
  const orderId = r.json.data?.gateway_order_id;
  check('fee checkout order created at Razorpay', r.status === 200 && razorpay.orders.get(orderId)?.amount === 30000, r.json);
  r = await call('POST', `/consultations/${c1.id}/pay/verify`, { token: t.patient, body: { ...checkoutPayment(orderId), razorpay_signature: 'f'.repeat(64) } });
  check('a forged payment signature is refused', r.status === 400, r.json);
  r = await call('POST', `/consultations/${c1.id}/pay/verify`, { token: t.patient, body: checkoutPayment(orderId) });
  check('signed payment confirms the fee', r.json.data?.payment_status === 'paid', r.json);
  r = await call('GET', `/consultations/${c1.id}/join`, { token: t.patient2 });
  check('nobody else can join', r.status === 404, r.status);
  r = await call('GET', `/consultations/${c1.id}/join`, { token: t.doctor });
  check('doctor opens the consultation', r.status === 200 && r.json.data.role === 'doctor' && r.json.data.mode === 'video', r.json);

  console.log('What a first video consultation may prescribe (C-23)');
  const item = (p, extra = {}) => ({ product_id: p, dosage: '1 tablet', frequency: 'twice a day', duration_days: 5, ...extra });
  const prescribe = (cid, items, extra = {}) => call('POST', `/consultations/${cid}/prescription`, { token: t.doctor, body: { diagnosis: 'Acute pharyngitis', items, ...extra } });
  r = await prescribe(c1.id, [item(P.ndps)]);
  check('NDPS never by teleconsultation', r.status === 422 && /never/.test(r.json.message), r.json);
  r = await prescribe(c1.id, [item(P.unclassified)]);
  check('an unclassified medicine is refused until a pharmacist classifies it', r.status === 422 && /classify/.test(r.json.message), r.json);
  const classify = (p, list, token = t.pharmacist) => call('POST', `/products/${p}/telemedicine-list`, { token, body: { list, notes: 'Per TPG 2020 annexure' } });
  r = await classify(P.a, 'A', t.patient);
  check('only a pharmacist or admin classifies', r.status === 403, r.status);
  await classify(P.a, 'A'); await classify(P.b, 'B');
  r = await classify(P.ndps, 'O');
  check('Schedule X / NDPS stay prohibited whatever is set', r.json.data?.telemedicine_list === 'prohibited', r.json);
  r = await prescribe(c1.id, [item(P.otc), item(P.b)]);
  check('List B refused on a first consultation', r.status === 422 && /follow-up/.test(r.json.message), r.json);
  r = await prescribe(c1.id, [item(P.otc), item(P.a, { instructions: 'After food' })], { advice: 'Warm saline gargles' });
  const rx1 = r.json.data;
  check('e-prescription issued with lists O and A', r.status === 201 && /^[A-Z2-9]{10}$/.test(rx1?.verification_code || ''), r.json);
  r = await prescribe(c1.id, [item(P.otc)]);
  check('an issued e-prescription cannot be replaced', r.status === 409, r.json);
  let blocked = null;
  try {
    await db.query('BEGIN'); await db.query("SET LOCAL dawabag.maintenance = 'off'");
    await db.query(`UPDATE digital_prescriptions SET diagnosis = 'x' WHERE id = $1`, [rx1.id]);
  } catch (e) { blocked = e.message; } finally { await db.query('ROLLBACK'); }
  check('issued e-prescriptions are final', !!blocked, blocked);
  r = await call('POST', `/consultations/${c1.id}/end`, { token: t.doctor, body: { notes: 'Advised review if fever persists' } });
  check('doctor ends the consultation', r.json.data?.status === 'completed', r.json);

  console.log('The e-prescription and the patient\'s choice of pharmacy (C-22, C-24)');
  r = await call('GET', `/consultations/prescriptions/${rx1.id}`, { token: t.patient });
  const rx = r.json.data;
  check('carries the doctor\'s registration and the patient\'s age and gender', rx?.doctor_reg_no === profile.nmc_reg_number && rx.doctor_council === profile.council
    && rx.doctor_qualification === profile.qualification && rx.patient_gender === 'female' && rx.patient_age >= 35, rx);
  check('medicines named generically first', rx?.items?.some((i) => i.medicine_name.startsWith('Amoxicillin (')), rx?.items);
  r = await call('GET', `/consultations/prescriptions/${rx1.id}/pdf`, { token: t.patient, raw: true });
  check('patient downloads the PDF', r.status === 200 && /pdf/.test(r.type) && r.buf.subarray(0, 4).toString() === '%PDF', r.status);
  r = await call('GET', `/consultations/prescriptions/${rx1.id}`, { token: t.patient2 });
  check('another patient cannot read it', r.status === 404, r.status);
  r = await call('GET', `/consultations/prescriptions/${rx1.id}`, { token: t.pharmacist });
  check('Dawabag pharmacists cannot read it unless the patient sends it', r.status === 404, r.status);
  r = await call('GET', `/eprescriptions/verify/${rx1.verification_code}`);
  check('any pharmacy verifies it by code (no login): valid, registration, medicines, initials only', r.status === 200 && r.json.data.valid
    && r.json.data.doctor.registration_no === profile.nmc_reg_number && r.json.data.items.length === 2 && r.json.data.patient.initials === 'S. P.', r.json.data);
  r = await call('GET', '/eprescriptions/verify/ABCDEFGHJK');
  check('unknown code', r.status === 404, r.status);
  r = await call('POST', `/consultations/prescriptions/${rx1.id}/use`, { token: t.patient });
  const sent = r.json.data;
  check('patient chooses to order at Dawabag: it goes to the pharmacist unverified (C-08)', r.status === 200 && sent.status === 'pending', r.json);
  r = await call('POST', `/consultations/prescriptions/${rx1.id}/use`, { token: t.patient });
  check('sending twice keeps one prescription', r.json.data?.prescription_id === sent.prescription_id, r.json);
  r = await call('GET', `/prescriptions/${sent.prescription_id}/url`, { token: t.pharmacist });
  check('pharmacist opens it from the queue as an on-demand PDF', r.json.data?.digital === true && r.json.data.pdf_path.includes(rx1.id), r.json);
  r = await call('GET', `/consultations/prescriptions/${rx1.id}/pdf`, { token: t.pharmacist, raw: true });
  check('…and can now read it', r.status === 200, r.status);
  const views = (await q(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE action = 'eprescription_viewed' AND new_value->>'prescription_id' = $1`, [rx1.id]))[0].n;
  check('every view is logged (C-41)', views >= 3, views);

  console.log('Follow-up consultations');
  r = await book(t.patient, slots.now2, { mode: 'audio' });
  const c2 = r.json.data;
  check('the same doctor within 180 days: a follow-up', c2?.consult_kind === 'follow_up', r.json);
  r = await call('POST', `/consultations/${c2.id}/pay`, { token: t.patient });
  await call('POST', `/consultations/${c2.id}/pay/verify`, { token: t.patient, body: checkoutPayment(r.json.data.gateway_order_id) });
  await call('GET', `/consultations/${c2.id}/join`, { token: t.doctor });
  r = await prescribe(c2.id, [item(P.a)], { new_condition: true });
  check('a new condition by audio is a first consultation: List A refused', r.status === 422 && /video/.test(r.json.message), r.json);
  r = await prescribe(c2.id, [item(P.b), item(P.a)]);
  check('follow-up by audio: List B add-on and List A re-fill allowed', r.status === 201 && r.json.data.consult_kind === 'follow_up', r.json);

  console.log('Joining early, cancelling and refunds');
  r = await book(t.patient2, slots.later);
  const c3 = r.json.data;
  r = await call('POST', `/consultations/${c3.id}/pay`, { token: t.patient2 });
  const pay3 = checkoutPayment(r.json.data.gateway_order_id);
  await call('POST', `/consultations/${c3.id}/pay/verify`, { token: t.patient2, body: pay3 });
  r = await call('GET', `/consultations/${c3.id}/join`, { token: t.patient2 });
  check('the call opens only 15 minutes before the slot', r.status === 409 && /15 minutes/.test(r.json.message), r.json);
  r = await call('POST', `/consultations/${c3.id}/cancel`, { token: t.patient2, body: { reason: 'Feeling better' } });
  check('patient cancels in time: full refund through Razorpay', r.status === 200 && r.json.data.refund?.amount_paise === 30000
    && razorpay.refunds.some((x) => x.payment_id === pay3.razorpay_payment_id && x.amount === 30000), r.json);
  const c3row = (await q(`SELECT payment_status, gateway_refund_id FROM consultations WHERE id = $1`, [c3.id]))[0];
  check('…recorded as refunded', c3row.payment_status === 'refunded' && /^rfnd_/.test(c3row.gateway_refund_id || ''), c3row);
  r = await call('GET', `/doctors/${docId}/slots?date=${S.later.slot_date}`);
  check('…and the slot is free again', r.json.data.some((x) => x.id === slots.later), r.json.data);
  r = await book(t.patient2, slots.now3);
  r = await call('POST', `/consultations/${r.json.data.id}/cancel`, { token: t.patient2, body: { reason: 'Busy' } });
  check('patients cannot cancel within 2 hours of the slot', r.status === 409 && /2 hours/.test(r.json.message), r.json);
  r = await book(t.patient, slots.tomorrow);
  r = await call('POST', `/consultations/${r.json.data.id}/cancel`, { token: t.doctor, body: { reason: 'On leave' } });
  check('the doctor can cancel; unpaid means nothing to refund', r.status === 200 && r.json.data.refund === null, r.json);

  r = await call('GET', `/consultations/doctor?date=${S.now1.slot_date}`, { token: t.doctor });
  check('doctor\'s day list with patient age and gender', r.json.data?.some((x) => x.id === c1.id && x.patient_gender === 'female' && x.prescription_id === rx1.id), r.json.data);
  r = await call('GET', '/consultations/my', { token: t.patient });
  check('patient\'s list shows the doctor\'s registration and the e-prescription', r.json.data?.some((x) => x.id === c1.id && x.nmc_reg_number === profile.nmc_reg_number && x.prescription_id === rx1.id), r.json.data);
}
