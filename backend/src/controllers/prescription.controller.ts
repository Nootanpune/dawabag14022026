import { Request, Response, NextFunction } from 'express';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne } from '../config/database';
import { AppError } from '../utils/AppError';
import { queueNotification } from '../services/notification.service';

const s3 = new AWS.S3({ region: process.env.AWS_REGION });

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

    await s3.upload({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: s3Key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ServerSideEncryption: 'AES256',
      Metadata: {
        user_id: userId,
        order_id: order_id || '',
        uploaded_at: new Date().toISOString(),
      },
    }).promise();

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
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const prescription = await queryOne<{ s3_key: string; user_id: string }>(
      'SELECT s3_key, user_id FROM prescriptions WHERE id = $1',
      [prescriptionId]
    );

    if (!prescription) throw new AppError('Prescription not found', 404);

    const isOwner = prescription.user_id === userId;
    const isStaff = ['pharmacist_rx', 'pharmacist_pack', 'admin', 'super_admin'].includes(userRole);

    if (!isOwner && !isStaff) throw new AppError('Access denied', 403);

    const url = s3.getSignedUrl('getObject', {
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: prescription.s3_key,
      Expires: 300, // 5 min
    });

    res.json({ success: true, data: { url, expires_in: 300 } });
  } catch (error) {
    next(error);
  }
}

// ─── Verify Prescription (Pharmacist) ─────────────────────────────────────────
export async function verifyPrescription(req: Request, res: Response, next: NextFunction) {
  try {
    const { prescriptionId } = req.params;
    const { action, rejection_reason, valid_days } = req.body;
    const pharmacistId = req.user!.id;

    if (!['verify', 'reject'].includes(action)) {
      throw new AppError('Action must be verify or reject', 400);
    }

    const prescription = await queryOne<{
      id: string; order_id: string; status: string;
    }>(
      'SELECT id, order_id, status FROM prescriptions WHERE id = $1',
      [prescriptionId]
    );

    if (!prescription) throw new AppError('Prescription not found', 404);
    if (prescription.status !== 'pending') {
      throw new AppError('Prescription already processed', 400);
    }

    const now = new Date();
    const validUntil = new Date(now);
    validUntil.setDate(validUntil.getDate() + (valid_days || 180));

    if (action === 'verify') {
      await query(
        `UPDATE prescriptions
         SET status = 'verified', verified_by = $1,
             verified_at = NOW(), valid_until = $2
         WHERE id = $3`,
        [pharmacistId, validUntil.toISOString().split('T')[0], prescriptionId]
      );

      if (prescription.order_id) {
        await query(
          `UPDATE orders SET status = 'rx_verified', updated_at = NOW()
           WHERE id = $1 AND status = 'rx_pending'`,
          [prescription.order_id]
        );
      }
    } else {
      await query(
        `UPDATE prescriptions
         SET status = 'rejected', verified_by = $1,
             verified_at = NOW(), rejection_reason = $2
         WHERE id = $3`,
        [pharmacistId, rejection_reason || 'Invalid prescription', prescriptionId]
      );

      if (prescription.order_id) {
        await query(
          `UPDATE orders SET status = 'rx_rejected', updated_at = NOW()
           WHERE id = $1`,
          [prescription.order_id]
        );
      }
    }

    // Notify customer
    if (prescription.order_id) {
      const orderData = await queryOne<{ user_id: string; order_number: string }>(
        'SELECT user_id, order_number FROM orders WHERE id = $1',
        [prescription.order_id]
      );
      if (orderData) {
        await queueNotification({
          userId: orderData.user_id,
          type: action === 'verify' ? 'rx_verified' : 'rx_rejected',
          orderId: prescription.order_id,
          orderNumber: orderData.order_number,
          reason: rejection_reason,
        });
      }
    }

    res.json({
      success: true,
      message: `Prescription ${action === 'verify' ? 'verified' : 'rejected'}`,
    });
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
              p.is_digital, p.doctor_name, p.order_id,
              pt.full_name as patient_name
       FROM prescriptions p
       LEFT JOIN patients pt ON pt.id = p.patient_id
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
