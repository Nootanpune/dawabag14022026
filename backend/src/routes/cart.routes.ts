import { Router } from 'express';
import { deleteMyCart, getMyCart, putCartCoupon, putCartItem } from '../controllers/cart.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// The cart belongs to a signed-in account; there is no guest/device cart.
router.use(authenticate);
router.get('/', getMyCart);
router.put('/items/:productId', putCartItem);
router.put('/coupon', putCartCoupon);
router.delete('/', deleteMyCart);

export default router;
