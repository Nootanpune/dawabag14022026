import { Router } from 'express';
import {
  searchProducts, getProductDetail, getCategories, createProduct, updateProduct, getContentQueue, postContentReview, setTelemedicineList,
  getAdminProducts, getAdminProduct,
} from '../controllers/product.controller';
import { deleteProductImage, productImageUpload, putProductImage } from '../controllers/productImage.controller';
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
// Pack photo: admin upload/replace (multipart "image") and removal; review per C-19
router.put('/:productId/image', authenticate, authorize('admin', 'super_admin'), productImageUpload.single('image'), putProductImage);
router.delete('/:productId/image', authenticate, authorize('admin', 'super_admin'), deleteProductImage);
router.post('/:productId/telemedicine-list', authenticate, authorize('pharmacist_rx'), setTelemedicineList);   // C-23

export default router;
