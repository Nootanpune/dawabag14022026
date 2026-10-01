import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  deleteMandate, deleteRefill, getMandates, getRefills, patchRefill, postMandate, postRefill,
} from '../controllers/refill.controller';

// Refill subscriptions and payment mandates — /api/v1/refills/*
const router = Router();
router.use(authenticate);

router.get('/', getRefills);
router.post('/', postRefill);
router.patch('/:id', patchRefill);
router.delete('/:id', deleteRefill);
router.get('/mandates/list', getMandates);
router.post('/mandates', postMandate);
router.delete('/mandates/:id', deleteMandate);

export default router;
