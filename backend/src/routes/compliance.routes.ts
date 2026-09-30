import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getAllAdr, getLicences, getMyAdr, getOneAdr, patchAdr, postAdr, postLicence, putLicence,
} from '../controllers/compliance.controller';

// Side-effect reports (C-29) and the licence register (C-07) — /api/v1/compliance/*
const router = Router();
router.use(authenticate);

const pharmacist = authorize('pharmacist_rx', 'admin', 'super_admin');
const admin = authorize('admin', 'super_admin');

router.get('/adverse-events', getMyAdr);
router.post('/adverse-events', postAdr);
router.get('/adverse-events/admin/all', pharmacist, getAllAdr);
router.patch('/adverse-events/:id', authorize('pharmacist_rx'), patchAdr);
router.get('/adverse-events/:id', getOneAdr);
router.get('/licences', admin, getLicences);
router.post('/licences', admin, postLicence);
router.put('/licences/:id', admin, putLicence);

export default router;
