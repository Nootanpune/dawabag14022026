import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getReport, listReports } from '../controllers/accounts.controller';

// Accountant reports — /api/v1/accounts/*
const router = Router();
router.use(authenticate, authorize('admin', 'super_admin'));
router.get('/reports', listReports);
router.get('/reports/:name', getReport);
export default router;
