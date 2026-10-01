import { Router } from 'express';
import {
  searchProducts, getProductDetail, getCategories, createProduct, updateProduct, getContentQueue, postContentReview, setTelemedicineList,
  getAdminProducts, getAdminProduct,
} from '../controllers/product.controller';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/search', optionalAuth, searchProducts);
router.get('/categories', getCategories);
router.get('/admin/list', authenticate, authorize('admin', 'super_admin', 'pharmacist_pack', 'pharmacist_rx'), getAdminProducts);
router.get('/:productId/admin', authenticate, authorize('admin', 'super_admin'), getAdminProduct);
router.get('/content-review/queue', authenticate, authorize('pharmacist_rx', 'admin', 'super_admin'), getContentQueue);
router.post('/:productId/content-review', authenticate, authorize('pharmacist_rx'), postContentReview);
router.get('/:productId', optionalAuth, getProductDetail);
router.post('/', authenticate, authorize('admin', 'super_admin'), createProduct);
router.patch('/:productId', authenticate, authorize('admin', 'super_admin'), updateProduct);
router.post('/:productId/telemedicine-list', authenticate, authorize('pharmacist_rx', 'admin', 'super_admin'), setTelemedicineList);   // C-23

export default router;
