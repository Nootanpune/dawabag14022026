// Doctor consultation, part 1: a doctor joins Dawabag. The admin turns an ordinary
// account into a doctor login, the doctor submits the council registration, the
// admin checks it against the register (C-22), the doctor opens slots, and the
// pharmacist classifies a medicine for teleconsultation (C-23).
import { Browser } from '@playwright/test';
import { shooter } from '../lib/recorder';
import { apiAs, staff } from '../lib/people';
import { dialog, field, newSession, onScreenOr, signIn } from '../lib/steps';
import { dbRow } from '../lib/orders';
import { istSoon, todayIST } from '../lib/time';

export const DOC = 'Doctor consultation';
export const doctorProfile = {
  full_name: 'Meera Joshi', qualification: 'MBBS, MD (General Medicine)', council: 'Maharashtra Medical Council',
  nmc_reg_number: 'MMC-2012-0619', registration_year: 2012, speciality: 'General Physician',
  clinic_name: 'Joshi Family Clinic, Nashik', consultation_fee_paise: 30000, languages_spoken: ['English', 'Hindi', 'Marathi'],
};
const doctorId = async () => (await dbRow(`SELECT d.id FROM doctor_profiles d JOIN users u ON u.id = d.user_id WHERE u.mobile = $1`, [staff.doctor.mobile]))?.id as string;

export async function doctorOnboarding(browser: Browser) {
  const admin = await newSession(browser, 'laptop');
  const adminShot = shooter(admin.page, DOC, 'Admin', 'laptop');
  await signIn(admin.page, 'admin');
  await admin.page.goto('/admin/doctors');
  let note = await onScreenOr(async () => {
    await admin.page.getByPlaceholder('Mobile number').fill(staff.doctor.mobile);
    await adminShot('Enable a doctor login', 'The doctor first registers like any customer. The admin enters that mobile number to give the account access to the doctor portal (C-22).');
    await admin.page.getByRole('button', { name: 'Enable', exact: true }).click();
    await admin.page.getByText(/can now sign in to the doctor portal/).waitFor();
  }, () => apiAs('admin', 'POST', '/doctors/admin/enable', { mobile: staff.doctor.mobile }), admin.page);

  // The doctor signs in after being enabled, so the new role is in the session
  const doc = await newSession(browser, 'laptop');
  const docShot = shooter(doc.page, DOC, 'Doctor', 'laptop');
  await signIn(doc.page, 'doctor');
  await doc.page.waitForURL((u) => u.pathname === '/doctor');   // a doctor lands on the portal home after signing in
  await docShot('Doctor portal, first visit', 'Before anything else the doctor must give the council registration; patients cannot see the doctor yet (C-22).', { note });
  await doc.page.goto('/doctor/profile');
  note = await onScreenOr(async () => {
    const p = doctorProfile, f = (label: string) => field(doc.page, label);
    await f('Full name').fill(p.full_name);
    await f('Qualification').fill(p.qualification);
    await f('Council').fill(p.council);
    await f('Registration number').fill(p.nmc_reg_number);
    await f('Year of registration').fill(String(p.registration_year));
    await f('Speciality').fill(p.speciality);
    await f('Clinic').fill(p.clinic_name);
    await f('Consultation fee').fill(String(p.consultation_fee_paise / 100));
    await f('Languages').fill(p.languages_spoken.join(', '));
    await docShot('Registration details', 'Name as on the register, qualification, council, registration number and year, and the fee. These are printed on every e-prescription (C-22, C-24).', { fullPage: true });
    await doc.page.getByRole('button', { name: 'Save profile' }).click();
    await doc.page.getByText(/admin is checking your registration/i).waitFor();
  }, () => apiAs('doctor', 'PUT', '/doctors/me/profile', doctorProfile), doc.page);
  await doc.page.reload();
  await docShot('Waiting for the check', 'Saved. The doctor waits while Dawabag checks the registration; slots cannot be opened until then.', { note });

  await admin.page.goto('/admin/doctors');
  note = await onScreenOr(async () => {
    await admin.page.locator('tr', { hasText: doctorProfile.full_name }).getByRole('button', { name: 'Verify' }).click();
    await dialog(admin.page).locator('textarea').fill(`Searched the Maharashtra Medical Council register on ${todayIST()}: name, qualification and number match.`);
    await adminShot('Check the registration', 'The admin searches the council register for the name and number, then records how it was checked. Approval names the number that was checked (C-22).');
    await dialog(admin.page).getByRole('button', { name: 'Verify', exact: true }).click();
    await dialog(admin.page).waitFor({ state: 'detached' });
  }, async () => {
    await apiAs('admin', 'POST', `/doctors/${await doctorId()}/verify`, { approve: true, notes: 'Checked on the MMC register', nmc_reg_number: doctorProfile.nmc_reg_number });
  }, admin.page);
  await admin.page.getByRole('button', { name: 'Verified', exact: true }).click();
  await adminShot('Doctor verified', 'Verified, with who checked it and when. Only verified doctors are listed to patients and can prescribe.', { note });
  await admin.ctx.close();

  // Slots: two 15-minute slots starting a few minutes from now, so the call can open (15 minutes before the slot)
  const soon = istSoon(5);
  await doc.page.goto('/doctor/slots');
  note = await onScreenOr(async () => {
    const form = doc.page.locator('div.card', { has: doc.page.getByRole('heading', { name: 'Add slots' }) });
    const f = (label: string) => form.getByLabel(label, { exact: true });
    await f('From').fill(soon.date);
    await f('To').fill(soon.date);
    await f('Start (IST)').fill(soon.time);
    await f('End (IST)').fill(soon.plus(30));
    await field(form, 'Minutes each').selectOption('15');
    if (soon.weekday === 0) await form.getByRole('button', { name: 'Sun', exact: true }).click();
    await form.getByRole('button', { name: 'Add slots' }).click();
    await doc.page.getByText(/2 slots added/).waitFor();
  }, () => apiAs('doctor', 'POST', '/doctors/me/slots', { slots: [0, 15].map((m) => ({ slot_date: soon.date, slot_start: soon.plus(m), slot_end: soon.plus(m + 15) })) }), doc.page);
  await docShot('Slots opened', 'Now verified, the doctor opens consultation times for a date range; each slot is one consultation (times in IST).', { fullPage: true, note });
  await doc.ctx.close();

  // Pharmacist: which medicines may be prescribed by teleconsultation (C-23)
  const ph = await newSession(browser, 'laptop');
  const phShot = shooter(ph.page, DOC, 'Pharmacist', 'laptop');
  await signIn(ph.page, 'pharmacist');
  await ph.page.goto('/staff/telemedicine-lists');
  note = await onScreenOr(async () => {
    await ph.page.getByPlaceholder('Search by name, generic or SKU').fill('E2E Amoxicillin');
    await ph.page.locator('tr', { hasText: 'E2E Amoxicillin 500' }).getByRole('button', { name: 'Set list' }).click();
    await dialog(ph.page).getByLabel(/^List A/).check();
    await dialog(ph.page).locator('textarea').fill('Antibiotic: List A under the Telemedicine Practice Guidelines 2020 annexure.');
    await phShot('Classify a medicine', 'A doctor cannot prescribe a medicine online until the pharmacist has placed it on a list of the Telemedicine Practice Guidelines. Amoxicillin goes on List A: first consultation by video only (C-23).');
    await dialog(ph.page).getByRole('button', { name: 'Save', exact: true }).click();
    await dialog(ph.page).waitFor({ state: 'detached' });
  }, () => apiAs('pharmacist', 'POST', `/products/${process.env.E2E_RX_PRODUCT_ID}/telemedicine-list`, { list: 'A', notes: 'TPG 2020 annexure' }), ph.page);
  await phShot('Medicine classified', 'Saved and recorded against the pharmacist. Schedule X and narcotic medicines can never be prescribed online.', { note });
  await ph.ctx.close();
}
