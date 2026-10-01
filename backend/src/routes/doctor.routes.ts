import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getDoctor, getDoctors, getDoctorSlots, getDoctorsForAdmin, getMyProfile, getMySlots, postBlockSlot, postEnableDoctor, postMySlots, postVerifyDoctor, putMyProfile,
} from '../controllers/doctor.controller';

// Teleconsultation doctors — /api/v1/doctors (C-22)
const router = Router();
const admin = [authenticate, authorize('admin', 'super_admin')];
const doctor = [authenticate, authorize('doctor')];

router.get('/admin/list', ...admin, getDoctorsForAdmin);
router.post('/admin/enable', ...admin, postEnableDoctor);
router.get('/me/profile', ...doctor, getMyProfile);
router.put('/me/profile', ...doctor, putMyProfile);
router.get('/me/slots', ...doctor, getMySlots);
router.post('/me/slots', ...doctor, postMySlots);
router.post('/me/slots/:slotId/block', ...doctor, postBlockSlot);
router.post('/:doctorId/verify', ...admin, postVerifyDoctor);
router.get('/', getDoctors);                         // public: verified doctors with their registration
router.get('/:doctorId', getDoctor);
router.get('/:doctorId/slots', getDoctorSlots);
export default router;
