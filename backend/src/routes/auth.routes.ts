import { Router } from 'express';
import { register, verifyMobileOTP, login, refreshToken, sendLoginOTP, logout } from '../controllers/auth.controller';

const router = Router();

router.post('/register', register);
router.post('/verify-otp', verifyMobileOTP);
router.post('/login', login);
router.post('/send-otp', sendLoginOTP);
router.post('/refresh', refreshToken);
router.post('/logout', logout);

export default router;
