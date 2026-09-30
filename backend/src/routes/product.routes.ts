import { Router } from 'express';
import { searchProducts, getProductDetail, getCategories, createProduct, updateProduct } from '../controllers/product.controller';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/search', optionalAuth, searchProducts);
router.get('/categories', getCategories);
router.get('/:productId', optionalAuth, getProductDetail);
router.post('/', authenticate, authorize('admin', 'super_admin'), createProduct);
router.patch('/:productId', authenticate, authorize('admin', 'super_admin'), updateProduct);

export default router;
