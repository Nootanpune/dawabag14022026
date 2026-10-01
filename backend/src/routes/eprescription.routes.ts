import { Router } from 'express';
import { getVerify } from '../controllers/consultation.controller';

// Public check of a Dawabag e-prescription by its code, for any pharmacy (C-24)
const router = Router();
router.get('/verify/:code', getVerify);
export default router;
