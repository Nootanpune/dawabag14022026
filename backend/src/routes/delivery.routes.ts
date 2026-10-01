import { Router } from 'express';
import { getDeliveryOffer } from '../controllers/deliveryOffer.controller';

// Public delivery information — /api/v1/delivery/*
const router = Router();
router.get('/offer', getDeliveryOffer);

export default router;
