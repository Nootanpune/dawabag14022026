// /api/v1/catalogue-lists — Sprint 31: product categories and HSN codes kept on the
// server. Admins and pharmacists (who complete new products) may add entries.
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getCategoryList, getHsnList, postCategory, postHsnCode } from '../controllers/catalogueLists.controller';

const router = Router();
const staff = authorize('pharmacist_rx', 'admin', 'super_admin');

router.use(authenticate);
router.get('/categories', staff, getCategoryList);
router.post('/categories', staff, postCategory);
router.get('/hsn-codes', staff, getHsnList);
router.post('/hsn-codes', staff, postHsnCode);

export default router;
