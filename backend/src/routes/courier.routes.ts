import { Router } from 'express';
import { postShiprocketWebhook } from '../controllers/courier.controller';

// Courier webhooks — /api/v1/courier/* (authenticated by the shared token, not a login)
const router = Router();
router.post('/shiprocket/webhook', postShiprocketWebhook);
export default router;
