import { Router } from 'express';
import multer from 'multer';
import { uploadPrescription, getPrescriptionUrl, getMyPrescriptions, getPendingRxQueue, postUseForOrder } from '../controllers/prescription.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const router = Router();

router.post('/upload', authenticate, upload.single('prescription'), uploadPrescription);
router.get('/my', authenticate, getMyPrescriptions);
router.get('/queue', authenticate, authorize('pharmacist_rx'), getPendingRxQueue);
router.get('/:prescriptionId/url', authenticate, getPrescriptionUrl);
router.post('/:prescriptionId/use-for-order', authenticate, postUseForOrder);
// Verification moved to POST /fulfilment/prescriptions/:id/verify (pharmacist only, C-08)

export default router;
