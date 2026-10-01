import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getDoctorDay, getJoin, getMine, getPrescription, getPrescriptionPdf, postBook, postCancel, postEnd, postPay, postPayVerify,
  postPrescription, postUseAtDawabag,
} from '../controllers/consultation.controller';

// Teleconsultations — /api/v1/consultations (Telemedicine Practice Guidelines 2020; C-22..C-24)
const router = Router();
router.use(authenticate);
router.post('/book', authorize('customer'), postBook);
router.get('/my', getMine);
router.get('/doctor', authorize('doctor'), getDoctorDay);
router.get('/prescriptions/:id', getPrescription);
router.get('/prescriptions/:id/pdf', getPrescriptionPdf);
router.post('/prescriptions/:id/use', postUseAtDawabag);
router.post('/:id/pay', postPay);
router.post('/:id/pay/verify', postPayVerify);
router.get('/:id/join', getJoin);
router.post('/:id/end', authorize('doctor'), postEnd);
router.post('/:id/cancel', postCancel);
router.post('/:id/prescription', authorize('doctor'), postPrescription);
export default router;
