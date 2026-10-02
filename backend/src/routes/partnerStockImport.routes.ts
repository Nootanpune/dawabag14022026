// /api/v1/partner/stock-imports — mounted inside partner.routes.ts, so every route
// already needs a signed-in, approved, active partner login (requirePartner) and
// works only on that partner's own imports.
import { Router } from 'express';
import {
  getStockImport, getStockImportRows, getStockImports, patchStockImportRow, postApplyStockImport, postCancelStockImport,
  postRequestNewProducts, postStockImport, postStockImportRecheck, putStockImportMapping, stockFileUpload,
} from '../controllers/partnerStockImport.controller';

const router = Router();

router.get('/', getStockImports);
router.post('/', stockFileUpload, postStockImport);
router.get('/:id', getStockImport);
router.get('/:id/rows', getStockImportRows);
router.put('/:id/mapping', putStockImportMapping);
router.post('/:id/recheck', postStockImportRecheck);
router.patch('/:id/rows/:rowId', patchStockImportRow);
router.post('/:id/request-new-products', postRequestNewProducts);
router.post('/:id/apply', postApplyStockImport);
router.post('/:id/cancel', postCancelStockImport);

export default router;
