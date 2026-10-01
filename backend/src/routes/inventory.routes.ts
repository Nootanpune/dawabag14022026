import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getLowStock } from '../controllers/stock.controller';

// /api/v1/inventory — low-stock alerts. Stock enters through goods receipts
// (/purchasing/receipts) and changes through approved adjustments (/stock/*);
// the old unvalidated batch, vendor and purchase-order routes were retired (Sprint 7).
const router = Router();
router.get('/low-stock', authenticate, authorize('admin', 'super_admin'), getLowStock);

export { router as inventoryRouter };
export default router;
