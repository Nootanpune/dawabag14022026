import { Router } from 'express';
import crypto from 'crypto';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';

const router = Router();

// ─── Book Consultation ────────────────────────────────────────────────────────
router.post('/book', authenticate, authorize('customer', 'doctor'), async (req, res, next) => {
  try {
    const { doctor_id, slot_id, patient_id, type } = req.body;
    if (!doctor_id || !slot_id) throw new AppError('Doctor and slot required', 400);

    const consultation = await withTransaction(async (client) => {
      // Lock slot
      const slot = await client.query(
        'SELECT id, is_booked, is_blocked FROM doctor_slots WHERE id = $1 AND doctor_id = $2 FOR UPDATE',
        [slot_id, doctor_id]
      );

      if (!slot.rows[0]) throw new AppError('Slot not found', 404);
      if (slot.rows[0].is_booked) throw new AppError('Slot already booked', 409);
      if (slot.rows[0].is_blocked) throw new AppError('Slot unavailable', 400);

      // Get fee
      const doctor = await client.query(
        'SELECT consultation_fee_paise FROM doctor_profiles WHERE id = $1 AND is_verified = TRUE',
        [doctor_id]
      );
      if (!doctor.rows[0]) throw new AppError('Doctor not found or not verified', 404);

      // Generate Agora channel
      const agoraChannel = `consult_${crypto.randomBytes(8).toString('hex')}`;

      const result = await client.query(
        `INSERT INTO consultations
           (doctor_id, patient_user_id, patient_id, slot_id, type, status, fee_paise, agora_channel)
         VALUES ($1,$2,$3,$4,$5,'booked',$6,$7)
         RETURNING id, agora_channel, fee_paise`,
        [doctor_id, req.user!.id, patient_id || null, slot_id,
         type || 'video', doctor.rows[0].consultation_fee_paise, agoraChannel]
      );

      // Mark slot as booked
      await client.query(
        'UPDATE doctor_slots SET is_booked = TRUE WHERE id = $1',
        [slot_id]
      );

      return result.rows[0];
    });

    res.status(201).json({
      success: true,
      message: 'Consultation booked. Proceed to payment.',
      data: consultation,
    });
  } catch (e) { next(e); }
});

// ─── Get My Consultations (Customer) ─────────────────────────────────────────
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const consultations = await query(
      `SELECT c.id, c.type, c.status, c.fee_paise, c.started_at, c.ended_at,
              dp.full_name as doctor_name, dp.speciality,
              ds.slot_date, ds.slot_start
       FROM consultations c
       JOIN doctor_profiles dp ON dp.id = c.doctor_id
       LEFT JOIN doctor_slots ds ON ds.id = c.slot_id
       WHERE c.patient_user_id = $1
       ORDER BY ds.slot_date DESC, ds.slot_start DESC`,
      [req.user!.id]
    );
    res.json({ success: true, data: consultations });
  } catch (e) { next(e); }
});

// ─── Get Today's Consultations (Doctor) ──────────────────────────────────────
router.get('/doctor/today', authenticate, authorize('doctor'), async (req, res, next) => {
  try {
    const profile = await queryOne<{ id: string }>(
      'SELECT id FROM doctor_profiles WHERE user_id = $1', [req.user!.id]
    );
    if (!profile) throw new AppError('Profile not found', 404);

    const consultations = await query(
      `SELECT c.id, c.type, c.status, c.agora_channel,
              up.full_name as patient_name, u.mobile as patient_mobile,
              ds.slot_start, ds.slot_end
       FROM consultations c
       JOIN users u ON u.id = c.patient_user_id
       LEFT JOIN user_profiles up ON up.user_id = c.patient_user_id
       LEFT JOIN doctor_slots ds ON ds.id = c.slot_id
       WHERE c.doctor_id = $1 AND ds.slot_date = CURRENT_DATE
       ORDER BY ds.slot_start`,
      [profile.id]
    );
    res.json({ success: true, data: consultations });
  } catch (e) { next(e); }
});

// ─── Join Consultation (get Agora token) ──────────────────────────────────────
router.get('/:consultationId/join', authenticate, async (req, res, next) => {
  try {
    const consultation = await queryOne<{
      id: string; agora_channel: string; patient_user_id: string;
      doctor_id: string; status: string;
    }>(
      `SELECT c.id, c.agora_channel, c.patient_user_id, c.doctor_id, c.status
       FROM consultations c WHERE c.id = $1`,
      [req.params.consultationId]
    );

    if (!consultation) throw new AppError('Consultation not found', 404);

    // Only patient or doctor can join
    const doctorProfile = await queryOne<{ id: string }>(
      'SELECT id FROM doctor_profiles WHERE user_id = $1', [req.user!.id]
    );

    const isPatient = consultation.patient_user_id === req.user!.id;
    const isDoctor = doctorProfile?.id === consultation.doctor_id;

    if (!isPatient && !isDoctor) throw new AppError('Access denied', 403);

    if (!['booked', 'in_progress'].includes(consultation.status)) {
      throw new AppError('Consultation is not active', 400);
    }

    // Update status to in_progress on first join
    if (consultation.status === 'booked') {
      await query(
        'UPDATE consultations SET status = $1, started_at = NOW() WHERE id = $2',
        ['in_progress', consultation.id]
      );
    }

    // Generate a simple Agora RTC token (in production use Agora Token Server)
    // For now return channel + app ID; integrate Agora Token Builder in production
    res.json({
      success: true,
      data: {
        channel: consultation.agora_channel,
        app_id: process.env.AGORA_APP_ID,
        uid: req.user!.id,
        role: isDoctor ? 'doctor' : 'patient',
        // token: await generateAgoraToken(consultation.agora_channel, uid),
      },
    });
  } catch (e) { next(e); }
});

// ─── End Consultation ─────────────────────────────────────────────────────────
router.patch('/:consultationId/end', authenticate, authorize('doctor'), async (req, res, next) => {
  try {
    const { notes } = req.body;
    await query(
      'UPDATE consultations SET status = $1, ended_at = NOW(), notes = $2 WHERE id = $3',
      ['completed', notes || null, req.params.consultationId]
    );
    res.json({ success: true, message: 'Consultation ended' });
  } catch (e) { next(e); }
});

// ─── Issue Digital Prescription ───────────────────────────────────────────────
router.post('/:consultationId/prescription', authenticate, authorize('doctor'), async (req, res, next) => {
  try {
    const { diagnosis, items, valid_days } = req.body;
    if (!diagnosis || !items?.length) throw new AppError('Diagnosis and items required', 400);

    const consultation = await queryOne<{
      id: string; doctor_id: string; patient_user_id: string; patient_id: string | null;
    }>(
      `SELECT c.id, c.doctor_id, c.patient_user_id, c.patient_id
       FROM consultations c
       JOIN doctor_profiles dp ON dp.id = c.doctor_id
       WHERE c.id = $1 AND dp.user_id = $2 AND c.status = 'completed'`,
      [req.params.consultationId, req.user!.id]
    );

    if (!consultation) throw new AppError('Consultation not found or not completed', 404);

    // Enforce telemedicine restriction: block H1/NDPS
    for (const item of items) {
      if (item.product_id) {
        const product = await queryOne<{ drug_schedule: string }>(
          'SELECT drug_schedule FROM products WHERE id = $1',
          [item.product_id]
        );
        if (product && ['Schedule H1', 'NDPS', 'Schedule X'].includes(product.drug_schedule)) {
          throw new AppError(
            `${item.medicine_name} cannot be prescribed via teleconsultation (Telemedicine Guidelines 2020)`,
            403
          );
        }
      }
    }

    const validDays = valid_days || 180;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + validDays);

    const rx = await withTransaction(async (client) => {
      const rxResult = await client.query(
        `INSERT INTO digital_prescriptions
           (consultation_id, doctor_id, patient_user_id, patient_id, diagnosis,
            telemedicine_issued, valid_until)
         VALUES ($1,$2,$3,$4,$5,TRUE,$6)
         RETURNING id`,
        [
          consultation.id, consultation.doctor_id,
          consultation.patient_user_id, consultation.patient_id,
          diagnosis, validUntil.toISOString().split('T')[0],
        ]
      );

      const rxId = rxResult.rows[0].id;

      for (const item of items) {
        await client.query(
          `INSERT INTO digital_prescription_items
             (prescription_id, product_id, medicine_name, dosage, frequency, duration_days, instructions)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            rxId, item.product_id || null, item.medicine_name,
            item.dosage || null, item.frequency || null,
            item.duration_days || null, item.instructions || null,
          ]
        );
      }

      // Also create a prescription record linked to patient
      await client.query(
        `INSERT INTO prescriptions
           (user_id, patient_id, s3_key, status, is_digital, doctor_name, valid_until)
         SELECT $1, $2, 'digital:' || $3, 'verified', TRUE,
                dp.full_name, $4
         FROM doctor_profiles dp WHERE dp.id = $5`,
        [
          consultation.patient_user_id, consultation.patient_id,
          rxId, validUntil.toISOString().split('T')[0],
          consultation.doctor_id,
        ]
      );

      return rxResult.rows[0];
    });

    res.status(201).json({
      success: true,
      message: 'Digital prescription issued',
      data: rx,
    });
  } catch (e) { next(e); }
});

// ─── Get Digital Prescription ─────────────────────────────────────────────────
router.get('/prescriptions/:rxId', authenticate, async (req, res, next) => {
  try {
    const rx = await queryOne(
      `SELECT dp.*, dp2.full_name as doctor_name, dp2.clinic_name, dp2.nmc_reg_number,
              up.full_name as patient_name
       FROM digital_prescriptions dp
       JOIN doctor_profiles dp2 ON dp2.id = dp.doctor_id
       LEFT JOIN user_profiles up ON up.user_id = dp.patient_user_id
       WHERE dp.id = $1 AND dp.patient_user_id = $2`,
      [req.params.rxId, req.user!.id]
    );

    if (!rx) throw new AppError('Prescription not found', 404);

    const items = await query(
      'SELECT * FROM digital_prescription_items WHERE prescription_id = $1',
      [req.params.rxId]
    );

    res.json({ success: true, data: { ...rx, items } });
  } catch (e) { next(e); }
});

export default router;
