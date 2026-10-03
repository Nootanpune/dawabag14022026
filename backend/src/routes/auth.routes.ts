import { Router } from 'express';
import { register, verifyMobileOTP, login, refreshToken, sendLoginOTP, logout } from '../controllers/auth.controller';
import { changePassword } from '../controllers/password.controller';
import { resetPassword } from '../controllers/passwordReset.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authOrEnrolChallenge, getStatus, postDisable, postEnrolConfirm, postEnrolStart, postRecoveryCodes, verifyChallenge } from '../controllers/twoFactor.controller';

const router = Router();

router.post('/register', register);
router.post('/verify-otp', verifyMobileOTP);
router.post('/login', login);
router.post('/send-otp', sendLoginOTP);
// Sprint 35: forgot password — the OTP from /send-otp, then a new password
router.post('/reset-password', resetPassword);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
// Sprint 28: also the forced first step after signing in with a temporary password
router.post('/change-password', authenticate, changePassword);
// Sprint 42: two-step sign-in (authenticator app) for staff and partner logins
router.post('/2fa/verify', verifyChallenge);
router.post('/2fa/enrol/start', authOrEnrolChallenge, postEnrolStart);
router.post('/2fa/enrol/confirm', authOrEnrolChallenge, postEnrolConfirm);
router.get('/2fa/status', authenticate, getStatus);
router.post('/2fa/disable', authenticate, postDisable);
router.post('/2fa/recovery-codes', authenticate, postRecoveryCodes);

export default router;
