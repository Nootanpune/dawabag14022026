import { postBookCourier } from '../controllers/courier.controller';
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getH1Register, getH1Registers, getH1Verify } from '../controllers/h1Register.controller';
import {
  getMyRun, getOrderCheck, getQueue, postCheck, getRiders, postApply, postDelivered, postPrescriberDetails, getH1Incomplete, postDispatch, postPack, postReassignRider, postReject, postVerify,
} from '../controllers/fulfilment.controller';

// Staff fulfilment — /api/v1/fulfilment/*
const router = Router();
router.use(authenticate);

const pharmacist = authorize('pharmacist_rx');
const packer = authorize('pharmacist_pack', 'admin', 'super_admin');

router.get('/queue', getQueue);                                      // role checked per stage
router.get('/prescriptions/h1-incomplete', pharmacist, getH1Incomplete);          // Sprint 38 (C-09)
router.post('/prescriptions/:id/verify', pharmacist, postVerify);
router.post('/prescriptions/:id/reject', pharmacist, postReject);
router.post('/prescriptions/:id/apply', pharmacist, postApply);
router.post('/prescriptions/:id/prescriber-details', pharmacist, postPrescriberDetails);   // Sprint 38 (C-09)
// Sprint 35: a registered pharmacist checks and releases every order before packing (C-08)
router.get('/checks/:orderId', authorize('pharmacist_rx', 'admin', 'super_admin'), getOrderCheck);
router.post('/shipments/:id/check', pharmacist, postCheck);
router.post('/shipments/:id/pack', packer, postPack);
router.post('/shipments/:id/book-courier', packer, postBookCourier);
router.post('/shipments/:id/dispatch', packer, postDispatch);
router.get('/riders', packer, getRiders);
router.get('/my-run', authorize('delivery'), getMyRun);
router.post('/shipments/:id/rider', packer, postReassignRider);
router.post('/shipments/:id/delivered', authorize('delivery', 'admin', 'super_admin'), postDelivered);
router.get('/h1-register', authorize('pharmacist_rx', 'admin', 'super_admin'), getH1Register);
// Sprint 38: one register per seller licence, hash-chained; the check recomputes every hash (C-09)
router.get('/h1-register/registers', authorize('pharmacist_rx', 'admin', 'super_admin'), getH1Registers);
router.get('/h1-register/verify', authorize('admin', 'super_admin'), getH1Verify);

export default router;
