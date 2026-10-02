import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getGoodsReceipts, getOneGoodsReceipt, getOnePurchaseOrder, getPurchaseOrders, getSuppliers, getOneSupplier, putSupplier, postApprovePo, postCancelPo,
  postClosePo, postGoodsReceipt, postPurchaseOrder, postSupplier,
} from '../controllers/purchasing.controller';
import {
  getOnePurchaseReturn, getPurchaseReturns, postDecidePurchaseReturn, postDispatchPurchaseReturn, postPurchaseReturn, postSettlePurchaseReturn,
} from '../controllers/purchaseReturn.controller';

// Suppliers, purchase orders and goods receipts — /api/v1/purchasing/*
const router = Router();
router.use(authenticate);
const admin = authorize('admin', 'super_admin');
const store = authorize('admin', 'super_admin', 'pharmacist_pack', 'pharmacist_rx');   // receiving at the store

router.get('/suppliers', store, getSuppliers);
router.post('/suppliers', admin, postSupplier);
router.get('/suppliers/:id', store, getOneSupplier);
router.put('/suppliers/:id', admin, putSupplier);
router.get('/purchase-orders', store, getPurchaseOrders);
router.post('/purchase-orders', admin, postPurchaseOrder);
router.get('/purchase-orders/:id', store, getOnePurchaseOrder);
router.post('/purchase-orders/:id/approve', admin, postApprovePo);
router.post('/purchase-orders/:id/cancel', admin, postCancelPo);
router.post('/purchase-orders/:id/close', admin, postClosePo);
router.get('/receipts', store, getGoodsReceipts);
router.post('/receipts', store, postGoodsReceipt);
router.get('/receipts/:id', store, getOneGoodsReceipt);
// Purchase returns to suppliers (C-28): store raises and dispatches, a second admin approves
router.get('/returns', store, getPurchaseReturns);
router.post('/returns', store, postPurchaseReturn);
router.get('/returns/:id', store, getOnePurchaseReturn);
router.post('/returns/:id/decide', admin, postDecidePurchaseReturn);
router.post('/returns/:id/dispatch', store, postDispatchPurchaseReturn);
router.post('/returns/:id/settle', admin, postSettlePurchaseReturn);
export default router;
