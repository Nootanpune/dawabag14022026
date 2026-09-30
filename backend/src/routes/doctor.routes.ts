import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { query, queryOne } from '../config/database';
import { AppError } from '../utils/AppError';

const router = Router();

// ─── Get all verified doctors (public) ───────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { speciality, page = '1' } = req.query;
    const limit = 20;
    const offset = (parseInt(page as string) - 1) * limit;
    const params: any[] = [];
    const conditions = ['dp.is_verified = TRUE', 'dp.is_active = TRUE'];
    let idx = 1;

    if (speciality) {
      conditions.push(`dp.speciality = $${idx++}`);
      params.push(speciality);
    }

    const doctors = await query(
      `SELECT dp.id, dp.full_name, dp.clinic_name, dp.speciality,
              dp.consultation_fee_paise, dp.bio, dp.languages_spoken
       FROM doctor_profiles dp
       WHERE ${conditions.join(' AND ')}
       ORDER BY dp.full_name ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    res.json({ success: true, data: doctors });
  } catch (e) { next(e); }
});

// ─── Get doctor detail ────────────────────────────────────────────────────────
router.get('/:doctorId', async (req, res, next) => {
  try {
    const doctor = await queryOne(
      `SELECT dp.id, dp.full_name, dp.clinic_name, dp.speciality,
              dp.consultation_fee_paise, dp.bio, dp.languages_spoken, dp.nmc_reg_number
       FROM doctor_profiles dp
       WHERE dp.id = $1 AND dp.is_verified = TRUE`,
      [req.params.doctorId]
    );
    if (!doctor) throw new AppError('Doctor not found', 404);
    res.json({ success: true, data: doctor });
  } catch (e) { next(e); }
});

// ─── Get available slots ──────────────────────────────────────────────────────
router.get('/:doctorId/slots', async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) throw new AppError('Date required', 400);

    const slots = await query(
      `SELECT id, slot_date, slot_start, slot_end, is_booked
       FROM doctor_slots
       WHERE doctor_id = $1 AND slot_date = $2
         AND is_blocked = FALSE AND is_booked = FALSE
       ORDER BY slot_start`,
      [req.params.doctorId, date]
    );

    res.json({ success: true, data: slots });
  } catch (e) { next(e); }
});

// ─── Doctor: setup profile ────────────────────────────────────────────────────
router.post('/profile', authenticate, authorize('doctor'), async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { full_name, clinic_name, speciality, nmc_reg_number, consultation_fee_paise, bio, languages_spoken } = req.body;

    if (!full_name || !nmc_reg_number) throw new AppError('Name and registration number required', 400);

    const existing = await queryOne('SELECT id FROM doctor_profiles WHERE user_id = $1', [userId]);
    if (existing) throw new AppError('Profile already exists', 409);

    const existing_nmc = await queryOne('SELECT id FROM doctor_profiles WHERE nmc_reg_number = $1', [nmc_reg_number]);
    if (existing_nmc) throw new AppError('Registration number already registered', 409);

    const profile = await queryOne(
      `INSERT INTO doctor_profiles
         (user_id, full_name, clinic_name, speciality, nmc_reg_number,
          consultation_fee_paise, bio, languages_spoken)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [userId, full_name, clinic_name || null, speciality || null, nmc_reg_number,
       consultation_fee_paise || 50000, bio || null, languages_spoken || ['English']]
    );

    res.status(201).json({
      success: true,
      message: 'Profile created. Awaiting admin verification.',
      data: profile,
    });
  } catch (e) { next(e); }
});

// ─── Doctor: get own profile ──────────────────────────────────────────────────
router.get('/me/profile', authenticate, authorize('doctor'), async (req, res, next) => {
  try {
    const profile = await queryOne(
      'SELECT * FROM doctor_profiles WHERE user_id = $1',
      [req.user!.id]
    );
    if (!profile) throw new AppError('Profile not found. Please complete your profile.', 404);
    res.json({ success: true, data: profile });
  } catch (e) { next(e); }
});

// ─── Doctor: manage slots ─────────────────────────────────────────────────────
router.post('/me/slots', authenticate, authorize('doctor'), async (req, res, next) => {
  try {
    const profile = await queryOne<{ id: string }>(
      'SELECT id FROM doctor_profiles WHERE user_id = $1 AND is_verified = TRUE',
      [req.user!.id]
    );
    if (!profile) throw new AppError('Verified doctor profile required', 403);

    const { slots } = req.body; // Array of { slot_date, slot_start, slot_end }
    if (!slots?.length) throw new AppError('Slots array required', 400);

    for (const slot of slots) {
      await query(
        `INSERT INTO doctor_slots (doctor_id, slot_date, slot_start, slot_end)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT DO NOTHING`,
        [profile.id, slot.slot_date, slot.slot_start, slot.slot_end]
      );
    }

    res.status(201).json({ success: true, message: `${slots.length} slots added` });
  } catch (e) { next(e); }
});

// ─── Doctor: block a slot ─────────────────────────────────────────────────────
router.patch('/me/slots/:slotId/block', authenticate, authorize('doctor'), async (req, res, next) => {
  try {
    const profile = await queryOne<{ id: string }>(
      'SELECT id FROM doctor_profiles WHERE user_id = $1',
      [req.user!.id]
    );
    if (!profile) throw new AppError('Profile not found', 404);

    await query(
      'UPDATE doctor_slots SET is_blocked = TRUE WHERE id = $1 AND doctor_id = $2',
      [req.params.slotId, profile.id]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ─── Admin: verify doctor ─────────────────────────────────────────────────────
router.patch('/:doctorId/verify', authenticate, authorize('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { action } = req.body; // 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) throw new AppError('Invalid action', 400);

    await query(
      'UPDATE doctor_profiles SET is_verified = $1, is_active = $1 WHERE id = $2',
      [action === 'approve', req.params.doctorId]
    );

    res.json({ success: true, message: `Doctor ${action}d` });
  } catch (e) { next(e); }
});

export default router;
