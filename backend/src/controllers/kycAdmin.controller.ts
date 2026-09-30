// src/controllers/kycAdmin.controller.ts
// Admin KYC review (Sprint 2): application detail, document viewing, manual
// PAN/GSTIN checks and whole-application rejection. Approval itself happens in
// KYCOrchestrator.checkAndActivate once every required check has passed.
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAudit } from '../utils/audit';
import { getPrivateObjectUrl } from '../services/storage.service';
import { DrugLicenseVerifier, IdentityVerifier, KYCOrchestrator, NMCVerifier } from '../services/kyc.service';

// GET /kyc/admin/applications/:userId
export async function getApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = z.string().uuid().parse(req.params.userId);
    const user = await queryOne<any>(
      `SELECT u.id, u.mobile, u.email, u.customer_type, u.kyc_status, u.kyc_submitted_at,
              u.kyc_approved_at, u.kyc_rejection_reason, u.business_name, u.registration_pincode,
              u.pan_number, u.pan_verified, u.gstin, u.gstin_verified, u.gst_unregistered_declaration,
              u.drug_license_type, u.drug_license_number, u.drug_license_expiry, u.drug_license_verified,
              u.nmc_reg_number, u.nmc_council_state, u.nmc_reg_verified, u.doctor_speciality,
              u.credit_limit_paise, u.credit_used_paise, u.created_at, up.full_name
       FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [userId]
    );
    if (!user) throw new AppError('User not found', 404);

    const state = await KYCOrchestrator.checkStatus(userId);
    const documents = await query(
      `SELECT id, document_type, original_name, mime_type, size_bytes, uploaded_at
       FROM kyc_documents WHERE user_id = $1 ORDER BY document_type`,
      [userId]
    );
    const history = await query(
      `SELECT a.action, a.notes, a.created_at, up.full_name AS performed_by_name
       FROM audit_logs a LEFT JOIN user_profiles up ON up.user_id = a.performed_by
       WHERE a.user_id = $1 AND (a.action LIKE 'kyc_%' OR a.action LIKE 'licence_%' OR a.action = 'gstin_flagged')
       ORDER BY a.created_at DESC LIMIT 50`,
      [userId]
    );

    res.json({
      success: true,
      data: {
        user,
        checks: state?.checks ?? [],
        missing_documents: state?.missingDocuments ?? [],
        licence_expired: state?.licenceExpired ?? false,
        documents,
        history,
        portal_links: {
          drug_license: DrugLicenseVerifier.getPortalUrl('MH'),
          nmc: NMCVerifier.getPortalUrl(user.nmc_council_state?.replace(/ Medical Council$/i, '')),
          gstin: 'https://services.gst.gov.in/services/searchtp',
          pan: 'https://eportal.incometax.gov.in/iec/foservices/#/pre-login/verifyYourPAN',
        },
      },
    });
  } catch (err) { next(err); }
}

// GET /kyc/admin/documents/:documentId/url — 5-minute link; every view is logged (C-41)
export async function getDocumentUrl(req: Request, res: Response, next: NextFunction) {
  try {
    const documentId = z.string().uuid().parse(req.params.documentId);
    const doc = await queryOne<{ user_id: string; document_type: string; storage_key: string }>(
      'SELECT user_id, document_type, storage_key FROM kyc_documents WHERE id = $1',
      [documentId]
    );
    if (!doc) throw new AppError('Document not found', 404);
    const url = getPrivateObjectUrl(doc.storage_key, 300);
    await writeAudit({
      userId: doc.user_id, action: 'kyc_document_viewed', performedBy: req.user!.id,
      newValue: { document_id: documentId, document_type: doc.document_type }, ip: req.ip,
    });
    res.json({ success: true, data: { url, expires_in: 300 } });
  } catch (err) { next(err); }
}

const identitySchema = z.object({
  user_id: z.string().uuid(),
  document_type: z.enum(['pan', 'gstin']),
  verified: z.boolean(),
  rejection_reason: z.string().trim().min(3).max(500).optional(),
  notes: z.string().max(1000).optional(),
}).refine((d) => d.verified || !!d.rejection_reason, {
  message: 'rejection_reason is required when verified = false', path: ['rejection_reason'],
});

// POST /kyc/admin/verify-identity — manual PAN / GSTIN check
export async function verifyIdentity(req: Request, res: Response, next: NextFunction) {
  try {
    const d = identitySchema.parse(req.body);
    await IdentityVerifier.recordAdminVerification({
      userId: d.user_id, documentType: d.document_type, verified: d.verified,
      rejectionReason: d.rejection_reason, notes: d.notes, adminId: req.user!.id,
    });
    await writeAudit({
      userId: d.user_id, action: d.verified ? 'kyc_check_verified' : 'kyc_check_failed',
      performedBy: req.user!.id, newValue: { check: d.document_type }, notes: d.rejection_reason ?? d.notes,
    });
    const activated = d.verified ? await KYCOrchestrator.checkAndActivate(d.user_id, req.user!.id) : false;
    res.json({ success: true, data: { verified: d.verified, account_activated: activated } });
  } catch (err) { next(err); }
}

// POST /kyc/admin/reject — reject the whole application with a reason
export async function rejectApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ user_id: z.string().uuid(), reason: z.string().trim().min(5).max(500) }).parse(req.body);
    await KYCOrchestrator.rejectApplication(d.user_id, d.reason, req.user!.id);
    res.json({ success: true, data: { kyc_status: 'rejected' } });
  } catch (err) { next(err); }
}
