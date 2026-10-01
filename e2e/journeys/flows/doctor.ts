// Doctor consultation, part 2: the patient books and pays (fake Razorpay), the
// doctor opens the consultation and writes the e-prescription, and the patient
// receives it — free to use it at any pharmacy (Telemedicine Practice Guidelines
// 2020; C-22, C-23, C-24). The video call itself needs Agora, which this rehearsal
// does not run: the join screens are shown, no call is placed.
import { Browser, Page } from '@playwright/test';
import { shooter } from '../lib/recorder';
import { fakeCheckoutPayment, useFakeCheckout } from '../lib/fakes';
import { apiAs } from '../lib/people';
import { dialog, newSession, onScreenOr, signIn } from '../lib/steps';
import { dbRow } from '../lib/orders';
import { DOC, doctorProfile } from './doctorOnboarding';

const DR = `Dr ${doctorProfile.full_name}`;
const COMPLAINT = 'Fever and sore throat for two days, mild cough.';
const consultation = async () => (await dbRow(
  `SELECT c.id, c.doctor_id, c.slot_id FROM consultations c JOIN users u ON u.id = c.patient_user_id
    WHERE u.mobile = '9000001902' ORDER BY c.created_at DESC LIMIT 1`))!;

/** One medicine line on the prescription form */
async function addMedicine(page: Page, n: number, search: string, name: string, dose: string[]) {
  const row = page.locator('div.border.rounded-lg', { has: page.getByText(`Medicine ${n}`, { exact: true }) });
  await row.getByPlaceholder('Search medicine').fill(search);
  await row.getByRole('button', { name: new RegExp(name) }).first().click();
  await row.getByPlaceholder(/^Dose/).fill(dose[0]);
  await row.getByPlaceholder(/^How often/).fill(dose[1]);
  await row.getByLabel('Days').fill(dose[2]);
  await row.getByPlaceholder(/^Instructions/).fill(dose[3]);
}

export async function doctorConsultation(browser: Browser) {
  // ── Patient books on the phone ──
  const pat = await newSession(browser, 'phone');
  await useFakeCheckout(pat.ctx);
  const patShot = shooter(pat.page, DOC, 'Patient', 'phone');
  await signIn(pat.page, 'buyer');
  await pat.page.goto('/consult');
  await pat.page.getByText(DR).first().waitFor();
  await patShot('Find a doctor', 'Only doctors whose council registration Dawabag has checked are listed, with qualification, council, registration number and fee (C-22).', { fullPage: true });
  await pat.page.locator('div.card', { hasText: DR }).getByRole('link', { name: 'Book' }).click();
  await pat.page.getByText('How would you like to consult?').waitFor();
  let note = await onScreenOr(async () => {
    await pat.page.getByRole('button', { name: /–/ }).first().click();
    await pat.page.getByLabel('Main problem').fill(COMPLAINT);
    await pat.page.locator('label', { hasText: 'I consent to a teleconsultation' }).locator('input[type=checkbox]').check();
    await patShot('Choose a slot', 'The patient picks a time, video, audio or chat, describes the problem and gives the consent the guidelines require. A first consultation by video allows the most medicines (C-23).', { fullPage: true });
    await pat.page.getByRole('button', { name: 'Book and pay' }).click();
    await pat.page.waitForURL('**/account/consultations', { timeout: 20_000 });
    await pat.page.getByText(/^Paid/).first().waitFor();
  }, async () => {
    const c = await dbRow(`SELECT d.id AS doctor_id, s.id AS slot_id FROM doctor_slots s JOIN doctor_profiles d ON d.id = s.doctor_id
                            WHERE d.nmc_reg_number = $1 AND NOT s.is_booked ORDER BY s.slot_date, s.slot_start LIMIT 1`, [doctorProfile.nmc_reg_number]);
    const b = await apiAs('buyer', 'POST', '/consultations/book', { doctor_id: c.doctor_id, slot_id: c.slot_id, mode: 'video', chief_complaint: COMPLAINT, consent: true });
    const order = await apiAs('buyer', 'POST', `/consultations/${b.id}/pay`);
    await apiAs('buyer', 'POST', `/consultations/${b.id}/pay/verify`, await fakeCheckoutPayment(order.gateway_order_id));
    await pat.page.goto('/account/consultations');
  }, pat.page);
  await patShot('Booked and paid', `The ₹${doctorProfile.consultation_fee_paise / 100} fee is paid through Razorpay (a test payment here). Cancelling at least 2 hours before refunds it in full; Join opens 15 minutes before the slot.`, { note });
  note = await onScreenOr(async () => {
    await pat.page.getByRole('button', { name: 'Join', exact: true }).click();
    await dialog(pat.page).getByText('Consultation room').waitFor();
  }, async () => {}, pat.page);
  if (!note) {
    await patShot('Patient join screen', 'Join opens the private call room with a call link valid for 30 minutes. The video itself runs on Agora; this rehearsal stops before the camera starts. Calls are never recorded.');
    await pat.page.keyboard.press('Escape');
  }

  // ── Doctor on the laptop ──
  const doc = await newSession(browser, 'laptop');
  const docShot = shooter(doc.page, DOC, 'Doctor', 'laptop');
  await signIn(doc.page, 'doctor');
  await doc.page.waitForURL((u) => u.pathname === '/doctor');
  await doc.page.getByText(COMPLAINT).waitFor();
  await docShot('Today\'s consultations', 'The doctor\'s day: time, mode, first or follow-up, the patient and the problem they described, and whether the fee is paid.');
  const { id: cid } = await consultation();
  note = await onScreenOr(async () => {
    await doc.page.getByRole('button', { name: 'Start / join' }).click();
    await dialog(doc.page).getByText('Consultation room').waitFor();
    await docShot('Start the consultation', 'Starting opens the same private call room and marks the consultation in progress. The video itself runs on Agora; this rehearsal does not start the camera (C-23).');
    await doc.page.keyboard.press('Escape');
    await doc.page.getByRole('link', { name: 'Write e-prescription' }).waitFor();
  }, () => apiAs('doctor', 'GET', `/consultations/${cid}/join`), doc.page);

  await doc.page.goto(`/doctor/consultations/${cid}/prescribe`);
  note = await onScreenOr(async () => {
    await doc.page.getByLabel('Diagnosis').fill('Acute pharyngitis');
    await addMedicine(doc.page, 1, 'E2E Paracetamol', 'E2E Paracetamol 500', ['1 tablet', 'three times a day if fever', '3', 'After food']);
    await doc.page.getByRole('button', { name: 'Add medicine' }).click();
    await addMedicine(doc.page, 2, 'E2E Amoxicillin', 'E2E Amoxicillin 500', ['1 capsule', 'twice a day', '5', 'Complete the course']);
    await doc.page.getByLabel(/^Advice/).fill('Warm saline gargles, plenty of fluids. See a doctor in person if the fever lasts beyond 3 days.');
    await docShot('Write the e-prescription', 'Diagnosis, medicines from the catalogue with dose, frequency and days, and advice. The note at the top says which medicine lists this consultation allows; the server refuses anything else (C-23).', { fullPage: true });
    await doc.page.getByRole('button', { name: 'Issue e-prescription' }).click();
    await doc.page.waitForURL(/\/doctor\/prescriptions\//, { timeout: 15_000 });
  }, async () => {
    await apiAs('doctor', 'POST', `/consultations/${cid}/prescription`, { diagnosis: 'Acute pharyngitis', advice: 'Warm saline gargles',
      items: [process.env.E2E_PRODUCT_ID, process.env.E2E_RX_PRODUCT_ID].map((p) => ({ product_id: p, dosage: '1 tablet', frequency: 'twice a day', duration_days: 5 })) });
    const rx = await dbRow(`SELECT id FROM digital_prescriptions WHERE consultation_id = $1`, [cid]);
    await doc.page.goto(`/doctor/prescriptions/${rx.id}`);
  }, doc.page);
  await docShot('E-prescription issued', 'Issued with the doctor\'s registration, the patient\'s details and a verification code. It cannot be changed once issued (C-24).', { fullPage: true, note });
  await doc.page.goto('/doctor');
  note = await onScreenOr(async () => {
    await doc.page.getByRole('button', { name: 'End', exact: true }).click();
    await dialog(doc.page).locator('textarea').fill('Advised review in person if fever persists beyond 3 days.');
    await dialog(doc.page).getByRole('button', { name: 'End consultation' }).click();
    await dialog(doc.page).waitFor({ state: 'detached' });
  }, () => apiAs('doctor', 'POST', `/consultations/${cid}/end`, { notes: 'Advised review if fever persists' }), doc.page);
  await docShot('Consultation completed', 'The doctor ends the consultation with private notes; the e-prescription stays linked to it.', { note });
  await doc.ctx.close();

  // ── Patient receives the e-prescription ──
  await pat.page.goto('/account/consultations');
  await patShot('E-prescription ready', 'The consultation shows as completed with the e-prescription attached.');
  await pat.page.getByRole('link', { name: 'View e-prescription' }).first().click();
  await pat.page.getByRole('button', { name: /Order these at Dawabag/ }).waitFor();
  await patShot('The e-prescription', 'The doctor\'s name, qualification and registration, the patient, diagnosis and medicines with dose and days, with a PDF and a code any pharmacy can check (C-24).', { fullPage: true });
  note = await onScreenOr(async () => {
    await pat.page.getByRole('button', { name: /Order these at Dawabag/ }).click();
    await pat.page.getByText(/Sent to the Dawabag pharmacist/).first().waitFor();
  }, async () => {
    const rx = await dbRow(`SELECT id FROM digital_prescriptions WHERE consultation_id = $1`, [cid]);
    await apiAs('buyer', 'POST', `/consultations/prescriptions/${rx.id}/use`);
    await pat.page.reload();
  }, pat.page);
  await patShot('Sent to Dawabag (optional)', 'Buying at Dawabag is the patient\'s choice, never a condition (C-24). If chosen, the prescription goes to our pharmacist, who checks it like any upload before an order is packed (C-08).', { fullPage: true, note });
  await pat.ctx.close();

  // ── Any pharmacy can check the code (signed out) ──
  const { verification_code: code } = (await dbRow(`SELECT verification_code FROM digital_prescriptions WHERE consultation_id = $1`, [cid]))!;
  const pub = await newSession(browser, 'laptop');
  await pub.page.goto(`/eprescriptions/verify/${code}`);
  await shooter(pub.page, DOC, 'Any pharmacy', 'laptop')('Check by code', 'Any pharmacy can confirm the prescription is genuine with its code, without signing in. Only the patient\'s initials are shown (C-24, C-41).', { fullPage: true });
  await pub.ctx.close();
}
