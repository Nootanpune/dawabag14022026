// Teleconsultation doctors (C-22). Only a doctor whose registration with the
// National Medical Commission or a State Medical Council has been checked by an
// admin against the council register can be listed, take slots or prescribe.
// The registration (council, number) is shown to patients and printed on every
// e-prescription. Doctors are never paid or rewarded for routing patients to
// Dawabag (C-20, C-24).
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';

export interface ProfileInput {
  full_name: string; qualification: string; council: string; nmc_reg_number: string; registration_year: number;
  speciality?: string; clinic_name?: string; consultation_fee_paise: number; bio?: string; languages_spoken?: string[];
}

const PUBLIC = `dp.id, dp.full_name, dp.qualification, dp.speciality, dp.clinic_name, dp.council, dp.nmc_reg_number,
                dp.registration_year, dp.consultation_fee_paise, dp.bio, dp.languages_spoken`;

// Admin: let a registered account work as a teleconsultation doctor
export async function enableDoctor(adminId: string, mobile: string) {
  return withTransaction(async (client) => {
    const u = (await client.query(`SELECT id, role FROM users WHERE mobile = $1 AND deleted_at IS NULL`, [mobile])).rows[0];
    if (!u) throw new AppError('No account with that mobile number', 404);
    if (!['customer', 'doctor'].includes(u.role)) throw new AppError(`This account is ${u.role}; use a separate account for teleconsultation`, 409);
    await client.query(`UPDATE users SET role = 'doctor' WHERE id = $1`, [u.id]);
    await writeAuditTx(client, { userId: u.id, action: 'doctor_enabled', performedBy: adminId });
    return { user_id: u.id, role: 'doctor' };
  });
}

// Doctor: registration details; any change sends the profile back for checking
export async function saveProfile(userId: string, p: ProfileInput) {
  return withTransaction(async (client) => {
    const clash = (await client.query(`SELECT 1 FROM doctor_profiles WHERE nmc_reg_number = $1 AND council = $2 AND user_id <> $3`,
      [p.nmc_reg_number, p.council, userId])).rows[0];
    if (clash) throw new AppError('That registration number is already on another profile', 409);
    const r = (await client.query(
      `INSERT INTO doctor_profiles (user_id, full_name, qualification, council, nmc_reg_number, registration_year, speciality,
         clinic_name, consultation_fee_paise, bio, languages_spoken, is_verified, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, FALSE, TRUE)
       ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, qualification = EXCLUDED.qualification,
         council = EXCLUDED.council, nmc_reg_number = EXCLUDED.nmc_reg_number, registration_year = EXCLUDED.registration_year,
         speciality = EXCLUDED.speciality, clinic_name = EXCLUDED.clinic_name, consultation_fee_paise = EXCLUDED.consultation_fee_paise,
         bio = EXCLUDED.bio, languages_spoken = EXCLUDED.languages_spoken, updated_at = NOW(),
         -- registration details changed: check again
         is_verified = doctor_profiles.is_verified AND doctor_profiles.nmc_reg_number = EXCLUDED.nmc_reg_number
           AND doctor_profiles.council = EXCLUDED.council AND doctor_profiles.full_name = EXCLUDED.full_name
           AND doctor_profiles.qualification = EXCLUDED.qualification
       RETURNING id, is_verified`,
      [userId, p.full_name, p.qualification, p.council, p.nmc_reg_number, p.registration_year, p.speciality ?? null,
       p.clinic_name ?? null, p.consultation_fee_paise, p.bio ?? null, p.languages_spoken ?? ['English']])).rows[0];
    await writeAuditTx(client, { userId, action: 'doctor_profile_saved', performedBy: userId,
      newValue: { council: p.council, reg_no: p.nmc_reg_number, verified: r.is_verified } });
    return { id: r.id, is_verified: r.is_verified, message: r.is_verified ? 'Profile saved' : 'Profile saved; an admin will check your registration with the council' };
  });
}

export async function myProfile(userId: string) {
  const p = await queryOne(`SELECT * FROM doctor_profiles WHERE user_id = $1`, [userId]);
  if (!p) throw new AppError('Complete your doctor profile first', 404);
  return p;
}

export async function verifiedDoctorId(userId: string): Promise<string> {
  const d = await queryOne<{ id: string }>(`SELECT id FROM doctor_profiles WHERE user_id = $1 AND is_verified AND is_active`, [userId]);
  if (!d) throw new AppError('Your registration has not been verified yet', 403);
  return d.id;
}

// Admin: checked against the council register (C-22)
export async function decideDoctor(adminId: string, doctorId: string, approve: boolean, notes: string) {
  return withTransaction(async (client) => {
    const d = (await client.query(`SELECT id, user_id FROM doctor_profiles WHERE id = $1 FOR UPDATE`, [doctorId])).rows[0];
    if (!d) throw new AppError('Doctor not found', 404);
    if (d.user_id === adminId) throw new AppError('You cannot verify your own registration', 403);
    await client.query(
      `UPDATE doctor_profiles SET is_verified = $2, is_active = $2, verified_by = $3, verified_at = NOW(), rejection_reason = $4 WHERE id = $1`,
      [doctorId, approve, adminId, approve ? null : notes]);
    await writeAuditTx(client, { userId: d.user_id, action: approve ? 'doctor_verified' : 'doctor_rejected', performedBy: adminId, notes });
    return { id: doctorId, is_verified: approve };
  });
}

export async function listDoctorsForAdmin(status: 'pending' | 'verified' | 'rejected' | undefined) {
  const where = status === 'verified' ? 'dp.is_verified' : status === 'rejected' ? 'NOT dp.is_verified AND dp.rejection_reason IS NOT NULL'
    : status === 'pending' ? 'NOT dp.is_verified AND dp.rejection_reason IS NULL' : 'TRUE';
  return query(`SELECT ${PUBLIC}, dp.is_verified, dp.verified_at, dp.rejection_reason, u.mobile, vu.full_name AS verified_by_name
                FROM doctor_profiles dp JOIN users u ON u.id = dp.user_id LEFT JOIN user_profiles vu ON vu.user_id = dp.verified_by
                WHERE ${where} ORDER BY dp.updated_at DESC LIMIT 300`);
}

// Public directory: verified doctors only, registration shown (C-22)
export async function listPublicDoctors(speciality: string | undefined, page: number) {
  return query(`SELECT ${PUBLIC} FROM doctor_profiles dp WHERE dp.is_verified AND dp.is_active
                ${speciality ? 'AND dp.speciality = $3' : ''} ORDER BY dp.full_name LIMIT $1 OFFSET $2`,
    speciality ? [20, (page - 1) * 20, speciality] : [20, (page - 1) * 20]);
}

export async function getPublicDoctor(id: string) {
  const d = await queryOne(`SELECT ${PUBLIC} FROM doctor_profiles dp WHERE dp.id = $1 AND dp.is_verified AND dp.is_active`, [id]);
  if (!d) throw new AppError('Doctor not found', 404);
  return d;
}

// ── Slots ────────────────────────────────────────────────────────────────────
export async function addSlots(userId: string, slots: { slot_date: string; slot_start: string; slot_end: string }[]) {
  const doctorId = await verifiedDoctorId(userId);
  let added = 0;
  for (const s of slots) {
    if (s.slot_end <= s.slot_start) throw new AppError(`Slot ${s.slot_date} ${s.slot_start}: end must be after start`, 400);
    const r = await query(`INSERT INTO doctor_slots (doctor_id, slot_date, slot_start, slot_end) VALUES ($1, $2, $3, $4)
                           ON CONFLICT (doctor_id, slot_date, slot_start) DO NOTHING RETURNING id`, [doctorId, s.slot_date, s.slot_start, s.slot_end]);
    added += r.length;
  }
  return { added, skipped: slots.length - added };
}

export async function blockSlot(userId: string, slotId: string) {
  const doctorId = await verifiedDoctorId(userId);
  const r = await query(`UPDATE doctor_slots SET is_blocked = TRUE WHERE id = $1 AND doctor_id = $2 AND NOT is_booked RETURNING id`, [slotId, doctorId]);
  if (!r.length) throw new AppError('Slot not found or already booked', 404);
  return { id: slotId, blocked: true };
}

export async function openSlots(doctorId: string, date: string) {
  return query(`SELECT id, slot_date, slot_start, slot_end FROM doctor_slots
                WHERE doctor_id = $1 AND slot_date = $2 AND NOT is_blocked AND NOT is_booked
                  AND (slot_date + slot_start) > (NOW() AT TIME ZONE 'Asia/Kolkata') ORDER BY slot_start`, [doctorId, date]);
}
