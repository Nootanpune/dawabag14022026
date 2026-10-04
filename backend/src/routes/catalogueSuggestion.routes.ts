// /api/v1/catalogue-suggestions — Sprint 46: suggested details for one partner's DRAFT
// products, imported from an .xlsx by admins and pharmacists. A suggestion is only shown
// on "New products to complete"; the pharmacist decides and approves each product
// (routes/catalogueDraft.routes.ts, C-10, C-19). Partners to choose from:
// GET /medicines/info-imports/partners (Sprint 45, same roles).
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  getSuggestionsFormat, getSuggestionsTemplate, postSuggestionsImport, suggestionsFileUpload,
} from '../controllers/catalogueSuggestion.controller';

const router = Router();
const staff = authorize('pharmacist_rx', 'admin', 'super_admin');

router.use(authenticate);
router.get('/template', staff, getSuggestionsTemplate);
router.get('/format', staff, getSuggestionsFormat);
router.post('/imports', staff, suggestionsFileUpload, postSuggestionsImport);

export default router;
