// E-prescriptions from teleconsultations (TPG 2020; C-22, C-23, C-24).
// Issued only by the consultation's verified doctor, only with medicines the
// guidelines allow for this consultation (rules.ts), with the doctor's and
// patient's details frozen at issue and a check code any pharmacy can verify.
// Final once issued (trigger). The patient may take it to any pharmacy; using it
// at Dawabag is a choice and it still goes to the pharmacist like any upload (C-08).
import crypto from 'crypto';
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAudit, writeAuditTx } from '../../utils/audit';
import { getSetting } from '../settings.service';
import { queueNotification } from '../notification.service';
import { verifiedDoctorId } from './doctor.service';
import { ConsultKind, refusal } from './rules';
import { todayIST } from '../../utils/ist';

export interface IssueInput {
  diagnosis: string; advice?: string; new_condition?: boolean;
  items: { product_id: string; dosage: string; frequency: string; duration_days: number; instructions?: string }[];
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.randomBytes(10), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

export async function issuePrescription(doctorUserId: string, consultationId: string, input: IssueInput) {
  const doctorId = await verifiedDoctorId(doctorUserId);
  const rx = await withTransaction(async (client) => {
    const c = (await client.query(
      `SELECT c.*, dp.full_name AS d_name, dp.qualification, dp.nmc_reg_number, dp.council,
              COALESCE(pt.full_name, up.full_name) AS p_name, COALESCE(pt.gender, up.gender) AS p_gender,
              date_part('year', age(COALESCE(pt.date_of_birth, up.date_of_birth)))::int AS p_age
       FROM consultations c JOIN doctor_profiles dp ON dp.id = c.doctor_id
       LEFT JOIN patients pt ON pt.id = c.patient_id LEFT JOIN user_profiles up ON up.user_id = c.patient_user_id
       WHERE c.id = $1 AND c.doctor_id = $2 FOR UPDATE OF c`, [consultationId, doctorId])).rows[0];
    if (!c) throw new AppError('Consultation not found', 404);
    if (!['in_progress', 'completed'].includes(c.status)) throw new AppError('Prescribe during or after the consultation', 409);
    if ((await client.query(`SELECT 1 FROM digital_prescriptions WHERE consultation_id = $1`, [consultationId])).rows[0]) {
      throw new AppError('A prescription was already issued for this consultation; it cannot be changed', 409);
    }
    const kind: ConsultKind = input.new_condition ? 'first' : c.consult_kind;
    const products = new Map((await client.query(
      // Drafts (Sprint 29) are not prescribable: their clinical details are not confirmed yet
      `SELECT id, name, generic_name, composition, drug_schedule, telemedicine_list FROM products
       WHERE id = ANY($1::uuid[]) AND catalogue_state IN ('live', 'not_listed')`,
      [input.items.map((i) => i.product_id)])).rows.map((p: any) => [p.id, p]));
    const problems = input.items.map((i, n) => {
      const p: any = products.get(i.product_id);
      return p ? refusal(p, kind, c.type) : `Item ${n + 1}: medicine not found`;
    }).filter(Boolean);
    if (problems.length) throw new AppError(problems.join('; '), 422);

    const validDays = Number(await getSetting('telemedicine.rx_valid_days', 30, client));
    const row = (await client.query(
      `INSERT INTO digital_prescriptions (consultation_id, doctor_id, patient_user_id, patient_id, diagnosis, advice, telemedicine_issued,
         valid_until, verification_code, consult_kind, consult_mode, doctor_name, doctor_qualification, doctor_reg_no, doctor_council,
         patient_name, patient_age, patient_gender)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE, CURRENT_DATE + $7::int, $8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING id, verification_code, valid_until, issued_at`,
      [consultationId, doctorId, c.patient_user_id, c.patient_id, input.diagnosis, input.advice ?? null, validDays, newCode(),
       kind, c.type, c.d_name, c.qualification, c.nmc_reg_number, c.council, c.p_name, c.p_age, c.p_gender])).rows[0];
    for (const i of input.items) {
      const p: any = products.get(i.product_id);
      // Generic name first, as the guidelines prefer
      const name = p.generic_name ? `${p.generic_name} (${p.name})` : p.name;
      await client.query(
        `INSERT INTO digital_prescription_items (prescription_id, product_id, medicine_name, dosage, frequency, duration_days, instructions, telemedicine_list)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [row.id, p.id, name, i.dosage, i.frequency, i.duration_days, i.instructions ?? null, p.telemedicine_list]);
    }
    await writeAuditTx(client, { userId: c.patient_user_id, action: 'eprescription_issued', performedBy: doctorUserId,
      newValue: { prescription_id: row.id, consultation_id: consultationId, kind, mode: c.type, items: input.items.length } });
    return { ...row, patient_user_id: c.patient_user_id, consult_kind: kind };
  });
  await queueNotification({ userId: rx.patient_user_id, type: 'eprescription_issued', reportNo: rx.verification_code });
  return { id: rx.id, verification_code: rx.verification_code, valid_until: rx.valid_until, consult_kind: rx.consult_kind };
}

// Who may read an e-prescription: the patient, its doctor, and pharmacists once
// the patient has chosen to use it at Dawabag (C-41: every view is logged)
export async function loadPrescription(id: string, viewer: { id: string; role: string }) {
  const rx = await queryOne<any>(
    `SELECT r.*, dp.user_id AS doctor_user_id, EXISTS (SELECT 1 FROM prescriptions p WHERE p.digital_prescription_id = r.id) AS sent_to_dawabag
     FROM digital_prescriptions r JOIN doctor_profiles dp ON dp.id = r.doctor_id WHERE r.id = $1`, [id]);
  const allowed = rx && (rx.patient_user_id === viewer.id || rx.doctor_user_id === viewer.id
    || (rx.sent_to_dawabag && viewer.role === 'pharmacist_rx'));   // minimum access (C-41)
  if (!allowed) throw new AppError('Prescription not found', 404);
  const items = await query(`SELECT medicine_name, dosage, frequency, duration_days, instructions, telemedicine_list FROM digital_prescription_items
                             WHERE prescription_id = $1 ORDER BY medicine_name`, [id]);
  await writeAudit({ userId: rx.patient_user_id, action: 'eprescription_viewed', performedBy: viewer.id, newValue: { prescription_id: id } });
  const { doctor_user_id, ...rest } = rx;
  return { ...rest, items };
}

// Any pharmacy can check an e-prescription by its code (C-24). Shows only what a
// pharmacist needs to match the paper: doctor, registration, validity, medicines.
export async function verifyByCode(code: string) {
  const rx = await queryOne<any>(
    `SELECT id, issued_at, valid_until, doctor_name, doctor_qualification, doctor_reg_no, doctor_council, patient_name, patient_age,
            patient_gender, consult_mode FROM digital_prescriptions WHERE verification_code = $1`, [code.toUpperCase()]);
  if (!rx) throw new AppError('No e-prescription with that code', 404);
  const items = await query(`SELECT medicine_name, dosage, frequency, duration_days FROM digital_prescription_items WHERE prescription_id = $1 ORDER BY medicine_name`, [rx.id]);
  await writeAudit({ userId: null, action: 'eprescription_checked_by_code', performedBy: null, newValue: { prescription_id: rx.id } });
  const initials = String(rx.patient_name || '').split(/\s+/).filter(Boolean).map((w: string) => `${w[0]}.`).join(' ');
  return {
    valid: new Date(rx.valid_until) >= new Date(todayIST()),
    issued_at: rx.issued_at, valid_until: rx.valid_until, consult_mode: rx.consult_mode,
    doctor: { name: rx.doctor_name, qualification: rx.doctor_qualification, registration_no: rx.doctor_reg_no, council: rx.doctor_council },
    patient: { initials, age: rx.patient_age, gender: rx.patient_gender },
    items,
  };
}

// The patient chooses to order at Dawabag: it joins their prescriptions, unverified (C-08)
// With an order waiting for a prescription, it is attached to that order exactly as an upload would be.
export async function useAtDawabag(userId: string, id: string, orderId?: string) {
  return withTransaction(async (client) => {
    const rx = (await client.query(`SELECT * FROM digital_prescriptions WHERE id = $1 AND patient_user_id = $2`, [id, userId])).rows[0];
    if (!rx) throw new AppError('Prescription not found', 404);
    if (new Date(rx.valid_until) < new Date(todayIST())) throw new AppError('This e-prescription has expired', 409);
    if (orderId) {
      const o = (await client.query(`SELECT status FROM orders WHERE id = $1 AND user_id = $2 FOR UPDATE`, [orderId, userId])).rows[0];
      if (!o) throw new AppError('Order not found', 404);
      if (!['pending_payment', 'rx_pending', 'rx_rejected'].includes(o.status)) throw new AppError('This order no longer needs a prescription', 409);
    }
    let p = (await client.query(`SELECT id, status, order_id FROM prescriptions WHERE digital_prescription_id = $1 FOR UPDATE`, [id])).rows[0];
    if (!p) {
      p = (await client.query(
        `INSERT INTO prescriptions (user_id, patient_id, order_id, status, is_digital, doctor_name, digital_prescription_id, file_type)
         VALUES ($1, $2, $3, 'pending', TRUE, $4, $5, 'eprescription') RETURNING id, status, order_id`,
        [userId, rx.patient_id, orderId ?? null, rx.doctor_name, id])).rows[0];
    } else if (orderId && p.order_id !== orderId) {
      if (p.order_id) throw new AppError('This e-prescription is already attached to another order', 409);
      await client.query(`UPDATE prescriptions SET order_id = $2 WHERE id = $1`, [p.id, orderId]);
    }
    if (orderId) await client.query(`UPDATE orders SET status = 'rx_pending', updated_at = NOW() WHERE id = $1 AND status = 'rx_rejected'`, [orderId]);
    await writeAuditTx(client, { userId, action: 'eprescription_sent_to_dawabag', performedBy: userId,
      newValue: { prescription_id: p.id, eprescription_id: id, order_id: orderId ?? null } });
    return { prescription_id: p.id, status: p.status, order_id: orderId ?? p.order_id ?? null };
  });
}
