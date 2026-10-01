// Teleconsultations (Telemedicine Practice Guidelines 2020; C-22, C-23). The
// patient books a verified doctor's slot, choosing the mode (video, audio or
// text) and recording consent; the fee is paid through Razorpay; the call opens
// 15 minutes before the slot. Whether it is a first consultation or a follow-up
// decides which medicines may be prescribed (rules.ts).
import crypto from 'crypto';
import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { getSetting } from '../settings.service';
import { refundConsultationFee } from './consultationFee.service';
import { ConsultMode, consultKind } from './rules';
import { verifiedDoctorId } from './doctor.service';

const JOIN_EARLY_MIN = 15;
const PATIENT_CANCEL_HOURS = 2;

export async function bookConsultation(userId: string, b: { doctor_id: string; slot_id: string; patient_id?: string; mode: ConsultMode; chief_complaint: string }) {
  return withTransaction(async (client) => {
    if (b.patient_id) {
      const own = (await client.query(`SELECT 1 FROM patients WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL`, [b.patient_id, userId])).rows[0];
      if (!own) throw new AppError('Patient not found', 404);
    }
    const doctor = (await client.query(`SELECT id, user_id, consultation_fee_paise FROM doctor_profiles WHERE id = $1 AND is_verified AND is_active`, [b.doctor_id])).rows[0];
    if (!doctor) throw new AppError('Doctor not found', 404);
    if (doctor.user_id === userId) throw new AppError('You cannot book yourself', 400);
    const slot = (await client.query(
      `SELECT id, is_booked, is_blocked, (slot_date + slot_start) > (NOW() AT TIME ZONE 'Asia/Kolkata') AS future
       FROM doctor_slots WHERE id = $1 AND doctor_id = $2 FOR UPDATE`, [b.slot_id, b.doctor_id])).rows[0];
    if (!slot) throw new AppError('Slot not found', 404);
    if (slot.is_booked || slot.is_blocked || !slot.future) throw new AppError('That slot is no longer available', 409);

    // Same doctor and patient within the follow-up window → follow-up (the doctor can mark a new condition)
    const last = (await client.query(
      `SELECT id, ended_at FROM consultations WHERE doctor_id = $1 AND patient_user_id = $2 AND patient_id IS NOT DISTINCT FROM $3
         AND status = 'completed' ORDER BY ended_at DESC LIMIT 1`, [b.doctor_id, userId, b.patient_id ?? null])).rows[0];
    const kind = consultKind(last?.ended_at ?? null, Number(await getSetting('telemedicine.follow_up_days', 180, client)), false);
    const fee = Number(doctor.consultation_fee_paise);
    const c = (await client.query(
      `INSERT INTO consultations (doctor_id, patient_user_id, patient_id, slot_id, type, status, fee_paise, agora_channel,
         chief_complaint, consult_kind, follow_up_of, consent_at, payment_status)
       VALUES ($1,$2,$3,$4,$5,'booked',$6,$7,$8,$9,$10,NOW(),$11)
       RETURNING id, type AS mode, consult_kind, fee_paise, payment_status`,
      [b.doctor_id, userId, b.patient_id ?? null, b.slot_id, b.mode, fee, `consult_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
       b.chief_complaint, kind, kind === 'follow_up' ? last.id : null, fee === 0 ? 'waived' : 'unpaid'])).rows[0];
    await client.query(`UPDATE doctor_slots SET is_booked = TRUE WHERE id = $1`, [b.slot_id]);
    await writeAuditTx(client, { userId, action: 'teleconsultation_consent', performedBy: userId,
      newValue: { consultation_id: c.id, mode: b.mode, kind } });
    return c;
  });
}

async function patientConsultation(userId: string, id: string) {
  const c = await queryOne<any>(`SELECT * FROM consultations WHERE id = $1 AND patient_user_id = $2`, [id, userId]);
  if (!c) throw new AppError('Consultation not found', 404);
  return c;
}

// Patient or the consultation's own (still verified) doctor; paid; from 15 minutes
// before the slot until an hour after it ends
export async function joinConsultation(userId: string, id: string) {
  const c = await queryOne<any>(
    `SELECT c.*, dp.user_id AS doctor_user_id, dp.is_verified AND dp.is_active AS doctor_ok,
            EXTRACT(EPOCH FROM ((s.slot_date + s.slot_start) - (NOW() AT TIME ZONE 'Asia/Kolkata'))) / 60 AS minutes_to_start,
            EXTRACT(EPOCH FROM ((NOW() AT TIME ZONE 'Asia/Kolkata') - (s.slot_date + s.slot_end))) / 60 AS minutes_after_end
     FROM consultations c JOIN doctor_profiles dp ON dp.id = c.doctor_id LEFT JOIN doctor_slots s ON s.id = c.slot_id WHERE c.id = $1`, [id]);
  const isPatient = c?.patient_user_id === userId, isDoctor = c?.doctor_user_id === userId && c?.doctor_ok;
  if (!c || (!isPatient && !isDoctor)) throw new AppError('Consultation not found', 404);
  if (Number(c.minutes_after_end) > 60) throw new AppError('This consultation\'s time has passed', 409);
  if (!['booked', 'in_progress'].includes(c.status)) throw new AppError(`Consultation is ${c.status}`, 409);
  if (!['paid', 'waived'].includes(c.payment_status)) throw new AppError('Pay the consultation fee to join', 402);
  if (Number(c.minutes_to_start) > JOIN_EARLY_MIN) throw new AppError(`The consultation opens ${JOIN_EARLY_MIN} minutes before the slot`, 409);
  if (c.status === 'booked' && isDoctor) await query(`UPDATE consultations SET status = 'in_progress', started_at = NOW() WHERE id = $1 AND status = 'booked'`, [id]);
  return { channel: c.agora_channel, mode: c.type, app_id: process.env.AGORA_APP_ID ?? null, role: isDoctor ? 'doctor' : 'patient' };
}

export async function endConsultation(userId: string, id: string, notes: string | undefined) {
  const doctorId = await verifiedDoctorId(userId);
  const r = await query(`UPDATE consultations SET status = 'completed', ended_at = NOW(), notes = $3
                         WHERE id = $1 AND doctor_id = $2 AND status = 'in_progress' RETURNING id`, [id, doctorId, notes ?? null]);
  if (!r.length) throw new AppError('Consultation not found or not in progress', 404);
  return { id, status: 'completed' };
}

// The doctor can cancel any time; the patient up to two hours before the slot. Paid fees are refunded in full.
export async function cancelConsultation(userId: string, id: string, reason: string) {
  const r = await withTransaction(async (client) => {
    const c = (await client.query(
      `SELECT c.*, dp.user_id AS doctor_user_id, EXTRACT(EPOCH FROM ((s.slot_date + s.slot_start) - (NOW() AT TIME ZONE 'Asia/Kolkata'))) / 3600 AS hours_to_start
       FROM consultations c JOIN doctor_profiles dp ON dp.id = c.doctor_id LEFT JOIN doctor_slots s ON s.id = c.slot_id
       WHERE c.id = $1 FOR UPDATE OF c`, [id])).rows[0];
    const isPatient = c?.patient_user_id === userId, isDoctor = c?.doctor_user_id === userId;
    if (!c || (!isPatient && !isDoctor)) throw new AppError('Consultation not found', 404);
    if (c.status !== 'booked') throw new AppError(`A consultation that is ${c.status.replace('_', ' ')} cannot be cancelled`, 409);
    if (isPatient && Number(c.hours_to_start) < PATIENT_CANCEL_HOURS) throw new AppError(`Cancel at least ${PATIENT_CANCEL_HOURS} hours before the slot`, 409);
    // A paid fee is owed back from this moment; the gateway refund follows the commit
    await client.query(`UPDATE consultations SET status = 'cancelled', cancelled_by = $2, cancel_reason = $3,
                          payment_status = CASE WHEN payment_status = 'paid' THEN 'refund_pending' ELSE payment_status END WHERE id = $1`, [id, userId, reason]);
    await client.query(`UPDATE doctor_slots SET is_booked = FALSE WHERE id = $1`, [c.slot_id]);
    await writeAuditTx(client, { userId: c.patient_user_id, action: 'consultation_cancelled', performedBy: userId, newValue: { consultation_id: id }, notes: reason });
    return c;
  });
  if (r.payment_status !== 'paid') return { id, status: 'cancelled', refund: null };
  const refund = await refundConsultationFee(id);
  return { id, status: 'cancelled', refund: refund ?? { pending: true, amount_paise: r.fee_paise } };
}

// A doctor whose registration is rejected: their open consultations are cancelled
// and refunded, and their free slots closed (C-22)
export async function cancelDoctorConsultations(client: PoolClient, doctorId: string, adminId: string): Promise<string[]> {
  const rows = (await client.query(
    `UPDATE consultations SET status = 'cancelled', cancelled_by = $2, cancel_reason = 'Doctor registration not verified',
       payment_status = CASE WHEN payment_status = 'paid' THEN 'refund_pending' ELSE payment_status END
     WHERE doctor_id = $1 AND status IN ('booked', 'in_progress')
       AND NOT EXISTS (SELECT 1 FROM digital_prescriptions rx WHERE rx.consultation_id = consultations.id)
     RETURNING id, slot_id, payment_status`, [doctorId, adminId])).rows;
  await client.query(`UPDATE doctor_slots SET is_blocked = TRUE WHERE doctor_id = $1 AND (slot_date + slot_start) > (NOW() AT TIME ZONE 'Asia/Kolkata')`, [doctorId]);
  return rows.filter((r: any) => r.payment_status === 'refund_pending').map((r: any) => r.id);
}

export async function myConsultations(userId: string) {
  return query(
    `SELECT c.id, c.type AS mode, c.status, c.consult_kind, c.fee_paise, c.payment_status, c.chief_complaint, c.started_at, c.ended_at,
            dp.full_name AS doctor_name, dp.qualification, dp.council, dp.nmc_reg_number, dp.speciality, s.slot_date, s.slot_start,
            rx.id AS prescription_id
     FROM consultations c JOIN doctor_profiles dp ON dp.id = c.doctor_id LEFT JOIN doctor_slots s ON s.id = c.slot_id
     LEFT JOIN digital_prescriptions rx ON rx.consultation_id = c.id
     WHERE c.patient_user_id = $1 ORDER BY s.slot_date DESC, s.slot_start DESC LIMIT 100`, [userId]);
}

export async function doctorConsultations(userId: string, date: string) {
  const doctorId = await verifiedDoctorId(userId);
  return query(
    `SELECT c.id, c.type AS mode, c.status, c.consult_kind, c.payment_status, c.chief_complaint, s.slot_date, s.slot_start, s.slot_end,
            COALESCE(pt.full_name, up.full_name) AS patient_name, COALESCE(pt.gender, up.gender) AS patient_gender,
            date_part('year', age(COALESCE(pt.date_of_birth, up.date_of_birth)))::int AS patient_age, rx.id AS prescription_id
     FROM consultations c JOIN doctor_slots s ON s.id = c.slot_id LEFT JOIN patients pt ON pt.id = c.patient_id
     LEFT JOIN user_profiles up ON up.user_id = c.patient_user_id LEFT JOIN digital_prescriptions rx ON rx.consultation_id = c.id
     WHERE c.doctor_id = $1 AND s.slot_date = $2 AND c.status <> 'cancelled' ORDER BY s.slot_start`, [doctorId, date]);
}

// One consultation, for its patient or its doctor
export async function getConsultation(userId: string, id: string) {
  const c = await queryOne<any>(
    `SELECT c.id, c.type AS mode, c.status, c.consult_kind, c.fee_paise, c.payment_status, c.chief_complaint, c.started_at, c.ended_at,
            c.patient_user_id, CASE WHEN dp.is_verified AND dp.is_active THEN dp.user_id END AS doctor_user_id, dp.id AS doctor_id, dp.full_name AS doctor_name, dp.qualification, dp.council, dp.nmc_reg_number,
            s.slot_date, s.slot_start, s.slot_end, COALESCE(pt.full_name, up.full_name) AS patient_name, COALESCE(pt.gender, up.gender) AS patient_gender,
            date_part('year', age(COALESCE(pt.date_of_birth, up.date_of_birth)))::int AS patient_age, rx.id AS prescription_id
     FROM consultations c JOIN doctor_profiles dp ON dp.id = c.doctor_id LEFT JOIN doctor_slots s ON s.id = c.slot_id
     LEFT JOIN patients pt ON pt.id = c.patient_id LEFT JOIN user_profiles up ON up.user_id = c.patient_user_id
     LEFT JOIN digital_prescriptions rx ON rx.consultation_id = c.id WHERE c.id = $1`, [id]);
  if (!c || (c.patient_user_id !== userId && c.doctor_user_id !== userId)) throw new AppError('Consultation not found', 404);
  const { patient_user_id, doctor_user_id, ...rest } = c;
  return rest;
}
