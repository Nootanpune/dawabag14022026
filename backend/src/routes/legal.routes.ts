import { Router } from 'express';
import { getLegalInfo } from '../controllers/grievance.controller';

// Public legal details for the footer — /api/v1/legal/* (C-04, C-36)
const router = Router();
router.get('/info', getLegalInfo);

export default router;
