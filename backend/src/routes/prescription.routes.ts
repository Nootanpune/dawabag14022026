import { Router } from 'express';
import multer from 'multer';
import { uploadPrescription, getPrescriptionUrl, getMyPrescriptions, getPendingRxQueue } from '../controllers/prescription.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const router = Router();

router.post('/upload', authenticate, upload.single('prescription'), uploadPrescription);
router.get('/my', authenticate, getMyPrescriptions);
router.get('/queue', authenticate, authorize('pharmacist_rx'), getPendingRxQueue);
router.get('/:prescriptionId/url', authenticate, getPrescriptionUrl);
// Verification moved to POST /fulfilment/prescriptions/:id/verify (pharmacist only, C-08)

export default router;
