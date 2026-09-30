import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requirePartner } from '../middleware/partner.middleware';
import {
  createListing, getListings, getMe, getMySettlement, getMySettlements, getShipments,
  postDelivered, postDispatch, putInventory, searchCatalogue,
} from '../controllers/partner.controller';

// Partner portal — /api/v1/partner/*
const router = Router();
router.use(authenticate, requirePartner);

router.get('/me', getMe);
router.get('/catalogue', searchCatalogue);
router.get('/products', getListings);
router.post('/products', createListing);
router.put('/products/:id/inventory', putInventory);
router.get('/shipments', getShipments);
router.post('/shipments/:id/dispatch', postDispatch);
router.post('/shipments/:id/delivered', postDelivered);
router.get('/settlements', getMySettlements);
router.get('/settlements/:id', getMySettlement);

export default router;
