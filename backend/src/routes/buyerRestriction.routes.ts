// Sprint 47: who may buy a product (everyone / doctors and hospitals only / licensed trade
// buyers only). Only a registered pharmacist changes it (checked in the service, with a
// reason; C-46); admins and pharmacists see it and its history.
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getBuyerRestrictionLog, getRestrictedProducts, putBuyerRestriction } from '../controllers/buyerRestriction.controller';

const router = Router();
router.use(authenticate);

router.get('/products', authorize('pharmacist_rx', 'admin', 'super_admin'), getRestrictedProducts);
router.get('/products/:productId/log', authorize('pharmacist_rx', 'admin', 'super_admin'), getBuyerRestrictionLog);
router.put('/products/:productId', authorize('pharmacist_rx'), putBuyerRestriction);

export default router;
