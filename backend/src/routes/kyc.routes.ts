// src/routes/kyc.routes.ts
import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  verifyGSTIN, verifyPAN, getKYCStatus, getKYCQueue,
  adminVerifyDrugLicense, adminVerifyNMC,
  getVerificationPortalLinks, upgradeDocToRetailer
} from '../controllers/kyc.controller';
import { KYC_MAX_FILE_BYTES, getMyKycDocuments, uploadKycDocument } from '../controllers/kycDocument.controller';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: KYC_MAX_FILE_BYTES, files: 1 } });

const router = Router();

// ── Customer-facing: auto-verify during signup (called from registration flow)
router.post('/verify-gstin',  verifyGSTIN);   // Auto-API — no auth (called at signup)
router.post('/verify-pan',    verifyPAN);     // Auto-API — no auth (called at signup)
router.get('/status/:userId', authenticate, getKYCStatus);

// ── Registration step 3: the buyer's own KYC documents
router.get('/documents',  authenticate, getMyKycDocuments);
router.post('/documents', authenticate, upload.single('file'), uploadKycDocument);

// ── Admin-only: manual verification + queue management
router.use(authenticate, authorize('admin','super_admin','pharmacist_rx'));

router.get('/admin/queue',               getKYCQueue);
router.get('/admin/portal-links/:user_id', getVerificationPortalLinks);

router.post('/admin/verify-drug-license', adminVerifyDrugLicense);
router.post('/admin/verify-nmc',          adminVerifyNMC);

// Super admin only — account type upgrades
router.post('/admin/upgrade-to-retailer',
  authorize('admin','super_admin'),
  upgradeDocToRetailer
);

export default router;
