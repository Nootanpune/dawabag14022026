import { Router } from 'express';
import multer from 'multer';
import { getPartnerPractitionerRegister } from '../controllers/practitionerSales.controller';
import {
  getPartnerLicenceDocument, getPartnerLicences, postPartnerLicenceDocument, postPartnerLicences,
} from '../controllers/partyLicence.controller';
import { LICENCE_FILE_MAX_BYTES } from '../services/licences/register.service';

const licenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LICENCE_FILE_MAX_BYTES, files: 1 } });
import { authenticate } from '../middleware/auth.middleware';
import { requirePartner, requirePartnerOwner } from '../middleware/partner.middleware';
import { partnerGetKeys, partnerPostKey, partnerRevokeKey } from '../controllers/partnerApiKeys.controller';
import { getMyReturn, getMyReturns } from '../controllers/partner.controller';
import stockImportRoutes from './partnerStockImport.routes';
import { getPartnerH1Register, getPartnerH1Verify } from '../controllers/h1Register.controller';
import {
  getPartnerGdpBatchLog, getPartnerGdpBatches, getPartnerPendingExcursions, postPartnerDisposition, postPartnerGdpRecord,
} from '../controllers/gdp.controller';
import {
  getPartnerChecks, getPartnerFeed, getPartnerFeedAlerts, postAcceptCheck, postDismissCheck, postLinkCheck, postRequestCheck,
} from '../controllers/stockFeed.controller';
import {
  createListing, getInventory, getListings, getMe, getPharmacists, postCheck, getMySettlement, getMySettlements, getShipments,
  postDelivered, postDispatch, putInventory, searchCatalogue, getMyBatchProvenance, postMyBatchProvenance,
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
router.get('/batch-provenance', getMyBatchProvenance);   // Sprint 39 (C-02)
router.post('/batch-provenance/:inventoryId', postMyBatchProvenance);   // Sprint 40: add where none is recorded yet
// Sprint 40: GDP records for the partner's own batches; its own pharmacist decides excursions (C-25)
router.get('/gdp/batches', getPartnerGdpBatches);
router.get('/gdp/batches/:id', getPartnerGdpBatchLog);
router.post('/gdp/batches/:id/records', postPartnerGdpRecord);
router.get('/gdp/excursions/pending', getPartnerPendingExcursions);
router.post('/gdp/excursions/:id/disposition', postPartnerDisposition);
router.get('/shipments', getShipments);
router.get('/pharmacists', getPharmacists);
router.post('/shipments/:id/check', postCheck);          // Sprint 35: release / hold / refuse (C-08)
router.post('/shipments/:id/dispatch', postDispatch);
router.post('/shipments/:id/delivered', postDelivered);
// Sprint 38: the partner's own Schedule H1 register (it is the licensee, C-09)
router.get('/h1-register', getPartnerH1Register);
// Sprint 44: its own sales to doctors / institutions (FDA Pune circular 16/2026; r.65(9)(b))
router.get('/practitioner-sales', getPartnerPractitionerRegister);
router.get('/h1-register/verify', getPartnerH1Verify);
router.get('/returns', getMyReturns);
router.get('/returns/:id', getMyReturn);
router.get('/settlements', getMySettlements);
router.get('/settlements/:id', getMySettlement);
// Stock file upload from the partner's billing software (Sprint 27)
router.use('/stock-imports', stockImportRoutes);
// Sprint 36: API keys for the billing software's automatic stock upload (owner login only)
// Sprint 37: live stock feed — status, the urgent badge, and items waiting for a person
router.get('/stock-feed', getPartnerFeed);
router.get('/stock-feed/alerts', getPartnerFeedAlerts);
router.get('/stock-feed/checks', getPartnerChecks);
router.post('/stock-feed/checks/:id/accept', postAcceptCheck);
router.post('/stock-feed/checks/:id/link', postLinkCheck);
router.post('/stock-feed/checks/:id/request-product', postRequestCheck);
router.post('/stock-feed/checks/:id/dismiss', postDismissCheck);
router.get('/api-keys', requirePartnerOwner, partnerGetKeys);
router.post('/api-keys', requirePartnerOwner, partnerPostKey);
router.post('/api-keys/:keyId/revoke', requirePartnerOwner, partnerRevokeKey);

export default router;
