import { Router } from 'express';
import { register, verifyMobileOTP, login, refreshToken, sendLoginOTP, logout } from '../controllers/auth.controller';
import { changePassword } from '../controllers/password.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', register);
router.post('/verify-otp', verifyMobileOTP);
router.post('/login', login);
router.post('/send-otp', sendLoginOTP);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
// Sprint 28: also the forced first step after signing in with a temporary password
router.post('/change-password', authenticate, changePassword);

export default router;
