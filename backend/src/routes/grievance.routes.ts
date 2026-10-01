import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getAllGrievances, getMyGrievances, getOneGrievance, patchGrievanceStatus, postGrievance, postGrievanceMessage,
} from '../controllers/grievance.controller';

// Complaints — /api/v1/grievances/* (C-36)
const router = Router();
router.use(authenticate);

const staff = authorize('admin', 'super_admin', 'pharmacist_rx');

router.get('/', getMyGrievances);
router.post('/', postGrievance);
router.get('/admin/all', staff, getAllGrievances);
router.patch('/:id/status', staff, patchGrievanceStatus);
router.get('/:id', getOneGrievance);
router.post('/:id/messages', postGrievanceMessage);

export default router;
