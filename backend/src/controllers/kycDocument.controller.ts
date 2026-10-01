// src/controllers/kycDocument.controller.ts
// Step 3 of registration: trade buyers upload the documents the URS v3.1
// matrix requires. Once every required document is in, the account moves to
// kyc_status 'pending_kyc' and appears in the admin KYC queue.
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { putPrivateObject } from '../services/storage.service';
import {
  KYC_DOCUMENT_TYPES, KycDocumentType, isBuyerType, requiredKycDocuments,
} from '../utils/customerType';

export const KYC_MAX_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

// Statuses in which a buyer may still add or replace documents
const EDITABLE_STATUSES = ['pending_otp', 'pending_kyc', 'rejected', 'pending_renewal'];

interface KycUser {
  customer_type: string;
  kyc_status: string;
  gstin: string | null;
}

async function documentState(userId: string) {
  const user = await queryOne<KycUser>(
    'SELECT customer_type, kyc_status, gstin FROM users WHERE id = $1 AND deleted_at IS NULL',
    [userId]
  );
  if (!user) throw new AppError('User not found', 404);
  const type = isBuyerType(user.customer_type) ? user.customer_type : 'customer';
  const required = requiredKycDocuments(type, !!user.gstin);
  const rows = await query<{ document_type: KycDocumentType }>(
    'SELECT document_type FROM kyc_documents WHERE user_id = $1',
    [userId]
  );
  const uploaded = rows.map((r) => r.document_type);
  const missing = required.filter((d) => !uploaded.includes(d));
  return { user, type, required, uploaded, missing };
}

// GET /kyc/documents
export async function getMyKycDocuments(req: Request, res: Response, next: NextFunction) {
  try {
    const { user, type, required, uploaded, missing } = await documentState(req.user!.id);
    res.json({
      success: true,
      data: { customer_type: type, kyc_status: user.kyc_status, required, uploaded, missing },
    });
  } catch (err) { next(err); }
}

// POST /kyc/documents  (multipart: document_type, file)
export async function uploadKycDocument(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.id;
    const { document_type } = z.object({
      document_type: z.enum(KYC_DOCUMENT_TYPES),
    }).parse(req.body);

    const file = req.file;
    if (!file) throw new AppError('No file uploaded', 400);
    const ext = ALLOWED_MIME[file.mimetype];
    if (!ext) throw new AppError('Only PDF, JPG and PNG files are allowed', 400);
    if (file.size > KYC_MAX_FILE_BYTES) throw new AppError('File must be 5 MB or smaller', 413);

    const before = await documentState(userId);
    if (before.type === 'customer') {
      throw new AppError('Documents are only needed for business and doctor accounts', 400);
    }
    if (!EDITABLE_STATUSES.includes(before.user.kyc_status)) {
      throw new AppError('Documents cannot be changed while the account is ' + before.user.kyc_status, 409);
    }
    const optional: KycDocumentType[] = before.type === 'doc_hospital' ? ['clinic_address_proof'] : [];
    if (!before.required.includes(document_type) && !optional.includes(document_type)) {
      throw new AppError(`${document_type} is not required for this account type`, 400);
    }

    const key = `kyc/${userId}/${document_type}/${uuidv4()}.${ext}`;
    await putPrivateObject(key, file.buffer, file.mimetype, {
      user_id: userId,
      document_type,
      uploaded_at: new Date().toISOString(),
    });

    await query(
      `INSERT INTO kyc_documents (user_id, document_type, storage_key, original_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, document_type) DO UPDATE
         SET storage_key = EXCLUDED.storage_key, original_name = EXCLUDED.original_name,
             mime_type = EXCLUDED.mime_type, size_bytes = EXCLUDED.size_bytes,
             uploaded_at = NOW()`,
      [userId, document_type, key, file.originalname?.slice(0, 255) || null, file.mimetype, file.size]
    );

    const after = await documentState(userId);
    let kycStatus = after.user.kyc_status;

    // All required documents in → submit for admin review
    if (after.missing.length === 0 && ['pending_otp', 'rejected'].includes(kycStatus)) {
      const updated = await queryOne<{ kyc_status: string }>(
        `UPDATE users SET kyc_status = 'pending_kyc', kyc_submitted_at = NOW(),
                kyc_rejection_reason = NULL, updated_at = NOW()
         WHERE id = $1 RETURNING kyc_status`,
        [userId]
      );
      kycStatus = updated?.kyc_status ?? kycStatus;
      await query(
        `INSERT INTO audit_logs (user_id, action, new_value, performed_by)
         VALUES ($1, 'kyc_submitted', $2, $1)`,
        [userId, JSON.stringify({ documents: after.uploaded })]
      );
      logger.info(`KYC submitted for review: user ${userId} (${after.type})`);
    }

    res.json({
      success: true,
      data: { document_type, uploaded: true, kyc_status: kycStatus, missing_documents: after.missing },
    });
  } catch (err) { next(err); }
}
