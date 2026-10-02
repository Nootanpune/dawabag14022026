import { Router } from 'express';
import multer from 'multer';
import {
  getPartnerLicenceDocument, getPartnerLicences, postPartnerLicenceDocument, postPartnerLicences,
} from '../controllers/partyLicence.controller';
import { LICENCE_FILE_MAX_BYTES } from '../services/licences/register.service';

const licenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LICENCE_FILE_MAX_BYTES, files: 1 } });
import { authenticate } from '../middleware/auth.middleware';
import { requirePartner } from '../middleware/partner.middleware';
import { getMyReturn, getMyReturns } from '../controllers/partner.controller';
import stockImportRoutes from './partnerStockImport.routes';
import {
  createListing, getInventory, getListings, getMe, getMySettlement, getMySettlements, getShipments,
  postDelivered, postDispatch, putInventory, searchCatalogue,
} from '../controllers/partner.controller';

// Partner portal — /api/v1/partner/*
const router = Router();
router.use(authenticate, requirePartner);

router.get('/me', getMe);
// Sprint 30: the partner's drug licences; renewals wait for Dawabag's check
router.get('/licences', getPartnerLicences);
router.post('/licences', postPartnerLicences);
router.post('/licences/:id/document', licenceUpload.single('file'), postPartnerLicenceDocument);
router.get('/licences/:id/document-url', getPartnerLicenceDocument);
router.get('/catalogue', searchCatalogue);
router.get('/products', getListings);
router.post('/products', createListing);
router.get('/products/:id/inventory', getInventory);
router.put('/products/:id/inventory', putInventory);
router.get('/shipments', getShipments);
router.post('/shipments/:id/dispatch', postDispatch);
router.post('/shipments/:id/delivered', postDelivered);
router.get('/returns', getMyReturns);
router.get('/returns/:id', getMyReturn);
router.get('/settlements', getMySettlements);
router.get('/settlements/:id', getMySettlement);
// Stock file upload from the partner's billing software (Sprint 27)
router.use('/stock-imports', stockImportRoutes);

export default router;
