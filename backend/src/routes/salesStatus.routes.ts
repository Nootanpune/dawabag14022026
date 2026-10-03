import { Router } from 'express';
import { getSalesStatus } from '../controllers/emergencyStop.controller';

// Public — /api/v1/sales-status (Sprint 38): is the emergency stop on? Web and app show a banner.
const router = Router();
router.get('/', getSalesStatus);

export default router;
