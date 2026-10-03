// /api/v1/catalogue-lists — Sprint 31: product categories and HSN codes kept on the
// server. Admins and pharmacists (who complete new products) may add entries.
// Sprint 32: admins rename, correct and switch entries off/on (Admin → Catalogue
// lists); pharmacists see the lists read-only there.
// Sprint 36: admins merge a duplicate category / HSN code into another (products move).
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getCategoryList, getHsnList, patchCategory, patchHsnCode, postCategory, postHsnCode, postMergeCategory, postMergeHsnCode,
} from '../controllers/catalogueLists.controller';

const router = Router();
const staff = authorize('pharmacist_rx', 'admin', 'super_admin');
const admins = authorize('admin', 'super_admin');

router.use(authenticate);
router.get('/categories', staff, getCategoryList);
router.post('/categories', staff, postCategory);
router.get('/hsn-codes', staff, getHsnList);
router.post('/hsn-codes', staff, postHsnCode);
router.patch('/categories/:id', admins, patchCategory);
router.patch('/hsn-codes/:code', admins, patchHsnCode);
router.post('/categories/:id/merge', admins, postMergeCategory);
router.post('/hsn-codes/:code/merge', admins, postMergeHsnCode);

export default router;
