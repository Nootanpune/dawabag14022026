// Sprint 39: pharmacist registration validity (handover D10; C-03, C-08, C-46)
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getMyRegistration, getRegistrations, putPartnerRegistration, putStaffRegistration } from '../controllers/pharmacistRegistration.controller';

const router = Router();
router.use(authenticate);
const admins = authorize('admin', 'super_admin');

router.get('/', admins, getRegistrations);
router.put('/staff/:userId', admins, putStaffRegistration);
router.put('/partner/:id', admins, putPartnerRegistration);
router.get('/me', authorize('pharmacist_rx'), getMyRegistration);

export default router;
