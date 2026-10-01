import { postBookCourier } from '../controllers/courier.controller';
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getH1Register, getMyRun, getQueue, getRiders, postApply, postDelivered, postDispatch, postPack, postReassignRider, postReject, postVerify,
} from '../controllers/fulfilment.controller';

// Staff fulfilment — /api/v1/fulfilment/*
const router = Router();
router.use(authenticate);

const pharmacist = authorize('pharmacist_rx');
const packer = authorize('pharmacist_pack', 'admin', 'super_admin');

router.get('/queue', getQueue);                                      // role checked per stage
router.post('/prescriptions/:id/verify', pharmacist, postVerify);
router.post('/prescriptions/:id/reject', pharmacist, postReject);
router.post('/prescriptions/:id/apply', pharmacist, postApply);
router.post('/shipments/:id/pack', packer, postPack);
router.post('/shipments/:id/book-courier', packer, postBookCourier);
router.post('/shipments/:id/dispatch', packer, postDispatch);
router.get('/riders', packer, getRiders);
router.get('/my-run', authorize('delivery'), getMyRun);
router.post('/shipments/:id/rider', packer, postReassignRider);
router.post('/shipments/:id/delivered', authorize('delivery', 'admin', 'super_admin'), postDelivered);
router.get('/h1-register', authorize('pharmacist_rx', 'admin', 'super_admin'), getH1Register);

export default router;
