import { requestPrescriptionReuse } from '../services/rxReuse.service';
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAudit } from '../utils/audit';
import { getPrivateObjectUrl, putPrivateObject } from '../services/storage.service';
import { queueNotification } from '../services/notification.service';


// ─── Upload Prescription ──────────────────────────────────────────────────────
export async function uploadPrescription(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { order_id, patient_id } = req.body;
    const file = req.file as Express.Multer.File;

    if (!file) throw new AppError('No file uploaded', 400);

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new AppError('Only JPEG, PNG, and PDF files are allowed', 400);
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new AppError('File size must be under 10MB', 400);
    }

    const uuidOk = (v: unknown) => v == null || v === '' || /^[0-9a-f-]{36}$/i.test(String(v));
    if (!uuidOk(order_id) || !uuidOk(patient_id)) throw new AppError('Invalid order or patient', 422);
    // A family member must be one of this account's own (C-41)
    if (patient_id) {
      const own = await queryOne('SELECT 1 FROM patients WHERE id = $1 AND owner_user_id = $2 AND deleted_at IS NULL', [patient_id, userId]);
      if (!own) throw new AppError('Patient not found', 404);
    }
    // Verify order belongs to user
    if (order_id) {
      const order = await queryOne(
        'SELECT id FROM orders WHERE id = $1 AND user_id = $2',
        [order_id, userId]
      );
      if (!order) throw new AppError('Order not found', 404);
    }

    // Upload to S3 with AES-256 encryption
    const ext = file.mimetype === 'application/pdf' ? 'pdf'
      : file.mimetype === 'image/png' ? 'png' : 'jpg';
    const s3Key = `prescriptions/${userId}/${uuidv4()}.${ext}`;

    await putPrivateObject(s3Key, file.buffer, file.mimetype, {
      user_id: userId,
      order_id: order_id || '',
      uploaded_at: new Date().toISOString(),
    });

    // Save to DB
    const prescription = await queryOne(
      `INSERT INTO prescriptions
         (user_id, patient_id, order_id, s3_key, original_filename, file_type)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, status`,
      [
        userId, patient_id || null, order_id || null,
        s3Key, file.originalname, ext,
      ]
    );

    // A fresh prescription for a rejected order puts it back in the pharmacist's queue
    if (order_id) {
      await query(`UPDATE orders SET status = 'rx_pending', updated_at = NOW() WHERE id = $1 AND status = 'rx_rejected'`, [order_id]);
    }

    res.status(201).json({
      success: true,
      message: 'Prescription uploaded successfully',
      data: prescription,
    });
  } catch (error) {
    next(error);
  }
}

// ─── Get Prescription Signed URL ─────────────────────────────────────────────
export async function getPrescriptionUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const { prescriptionId } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(prescriptionId)) throw new AppError('Prescription not found', 404);
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const prescription = await queryOne<{ s3_key: string | null; user_id: string; digital_prescription_id: string | null }>(
      'SELECT s3_key, user_id, digital_prescription_id FROM prescriptions WHERE id = $1',
      [prescriptionId]
    );

    if (!prescription) throw new AppError('Prescription not found', 404);

    // Health data: only the buyer and pharmacists may open it; every view is logged (C-41)
    const isOwner = prescription.user_id === userId;
    const isPharmacist = userRole === 'pharmacist_rx';
    if (!isOwner && !isPharmacist) throw new AppError('Access denied', 403);

    // A Dawabag e-prescription has no upload: its PDF is rendered on demand (C-24)
    if (!prescription.s3_key) {
      return res.json({ success: true, data: { digital: true, eprescription_id: prescription.digital_prescription_id,
        pdf_path: `/consultations/prescriptions/${prescription.digital_prescription_id}/pdf` } });
    }
    const url = await getPrivateObjectUrl(prescription.s3_key, 300);
    await writeAudit({ userId: prescription.user_id, action: 'prescription_viewed', performedBy: userId,
      newValue: { prescription_id: prescriptionId }, ip: req.ip });

    res.json({ success: true, data: { url, expires_in: 300 } });
  } catch (error) {
    next(error);
  }
}

// ─── Get My Prescriptions ─────────────────────────────────────────────────────
export async function getMyPrescriptions(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;

    const prescriptions = await query(
      `SELECT p.id, p.status, p.valid_until, p.created_at,
              p.is_digital, p.doctor_name, p.order_id, p.prescriber_name, p.prescribed_on,
              p.file_type, p.original_filename, p.rejection_reason,   -- for the /prescriptions page (Sprint 25)
              o.order_number,
              pt.full_name as patient_name
       FROM prescriptions p
       LEFT JOIN patients pt ON pt.id = p.patient_id
       LEFT JOIN orders o ON o.id = p.order_id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId]
    );

    res.json({ success: true, data: prescriptions });
  } catch (error) {
    next(error);
  }
}

// ─── Pending Rx Queue (Pharmacist) ────────────────────────────────────────────
export async function getPendingRxQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string || '1');
    const limit = 20;
    const offset = (page - 1) * limit;

    const prescriptions = await query(
      `SELECT pr.id, pr.created_at, pr.file_type,
              o.order_number, o.id as order_id,
              up.full_name as patient_name,
              u.mobile as patient_mobile
       FROM prescriptions pr
       JOIN orders o ON o.id = pr.order_id
       JOIN users u ON u.id = pr.user_id
       LEFT JOIN user_profiles up ON up.user_id = pr.user_id
       WHERE pr.status = 'pending' AND o.status = 'rx_pending'
       ORDER BY pr.created_at ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({ success: true, data: prescriptions });
  } catch (error) {
    next(error);
  }
}

// POST /prescriptions/:prescriptionId/use-for-order { order_id } — offer a saved, verified
// prescription for an order; the pharmacist confirms it (C-08)
export async function postUseForOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { order_id } = z.object({ order_id: z.string().uuid() }).parse(req.body);
    res.json({ success: true, data: await requestPrescriptionReuse(req.user!.id, z.string().uuid().parse(req.params.prescriptionId), order_id) });
  } catch (err) { next(err); }
}
