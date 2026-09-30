// src/routes/kyc.routes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  verifyGSTIN, verifyPAN, getKYCStatus, getKYCQueue,
  adminVerifyDrugLicense, adminVerifyNMC,
  getVerificationPortalLinks, upgradeDocToRetailer
} from '../controllers/kyc.controller';

const router = Router();

// ── Customer-facing: auto-verify during signup (called from registration flow)
router.post('/verify-gstin',  verifyGSTIN);   // Auto-API — no auth (called at signup)
router.post('/verify-pan',    verifyPAN);     // Auto-API — no auth (called at signup)
router.get('/status/:userId', authenticate, getKYCStatus);

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
