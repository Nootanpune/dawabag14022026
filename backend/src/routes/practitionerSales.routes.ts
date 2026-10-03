import { Router } from 'express';
import multer from 'multer';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.middleware';
import {
  getMyPractitionerRegistration, getMyWrittenOrders, getPractitionerRegister, getPractitioners, getWrittenOrderCertificate, getWrittenOrderLink,
  getWrittenOrderOne, getWrittenOrderPdf, postPractitionerRegistration, postRequisition, postRequisitionPreview, postWrittenOrderUpload,
} from '../controllers/practitionerSales.controller';
import { WRITTEN_ORDER_MAX_BYTES } from '../services/practitionerSales/writtenOrder.service';

// Sprint 44 — sales to doctors and medical institutions (r.64(2), r.65(9)(b); FDA Pune circular 16/2026)
const staff = authorize('admin', 'super_admin', 'pharmacist_rx');
const admin = authorize('admin', 'super_admin');

// /api/v1/practitioner-sales/*
export const practitionerSalesRouter = Router();
practitionerSalesRouter.use(authenticate);
practitionerSalesRouter.get('/me', getMyPractitionerRegistration);
practitionerSalesRouter.get('/practitioners', staff, getPractitioners);
practitionerSalesRouter.post('/practitioners/:userId/registration', admin, postPractitionerRegistration);
practitionerSalesRouter.get('/register', staff, getPractitionerRegister);

// /api/v1/written-orders/*
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: WRITTEN_ORDER_MAX_BYTES, files: 1 } });
export const writtenOrderRouter = Router();
writtenOrderRouter.get('/:id/document.pdf', optionalAuth, getWrittenOrderPdf);   // session or signed link
writtenOrderRouter.use(authenticate);
writtenOrderRouter.post('/upload', authorize('customer'), upload.single('file'), postWrittenOrderUpload);
writtenOrderRouter.post('/requisition/preview', authorize('customer'), postRequisitionPreview);
writtenOrderRouter.post('/requisition', authorize('customer'), postRequisition);
writtenOrderRouter.get('/mine', authorize('customer'), getMyWrittenOrders);
writtenOrderRouter.get('/:id', getWrittenOrderOne);
writtenOrderRouter.get('/:id/link', getWrittenOrderLink);
writtenOrderRouter.get('/:id/certificate', getWrittenOrderCertificate);
