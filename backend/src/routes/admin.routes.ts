import { getDeliveries } from '../controllers/device.controller';
import { setPharmacistRegistration } from '../controllers/fulfilment.controller';
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { query, queryOne } from '../config/database';
import { AppError } from '../utils/AppError';
import { listOpenCredit, setCreditLimit } from '../controllers/credit.controller';
import { listJobs, runJobNow } from '../controllers/jobs.controller';
import {
  getSettings, getSettlementDetail, getSettlements, linkPartnerUser, postGenerateSettlements,
  postSettlementPaid, postShipmentDelivered, putSetting, setCommission,
} from '../controllers/marketplaceAdmin.controller';
import {
  adminGetStockImport, adminGetStockImportRows, adminListProductRequests, adminListStockImports, adminResolveProductRequest,
} from '../controllers/partnerStockImport.controller';
import { getPartnerDetail, getPartners, postPartner, postPartnerLogin, putPartner } from '../controllers/partnerAdmin.controller';
import { adminGetKeys, adminPostKey, adminRevokeKey } from '../controllers/partnerApiKeys.controller';
import { getAdminChecks, getAdminFeedAlerts, getAdminPartnerFeed, putAdminPartnerFeed } from '../controllers/stockFeed.controller';
import { postCreateDrafts } from '../controllers/catalogueDraft.controller';
import multer from 'multer';
import {
  getAdminLicenceDocument, getPartyLicences, postAdminLicenceDocument, postLicenceDecision,
} from '../controllers/partyLicence.controller';
import { LICENCE_FILE_MAX_BYTES } from '../services/licences/register.service';
import { sellingRightsStatus } from '../services/stock/sellingRightsStatus';
import { getEmergencyStop, postPause, postResume } from '../controllers/emergencyStop.controller';
import { getOverview as getTwoFactorOverview, postReset as postTwoFactorReset } from '../controllers/twoFactor.controller';
import { getAuditChainVerify } from '../controllers/h1Register.controller';
import { latestHeads, runChainVerify } from '../services/chainVerify/heads.service';
import { configWarnings } from '../services/system/configWarnings';
import { getLaunchReadiness, putManualItem } from '../controllers/launchReadiness.controller';

const licenceUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LICENCE_FILE_MAX_BYTES, files: 1 } });

const router = Router();

// ─── Admin Dashboard Stats ────────────────────────────────────────────────────
router.get('/stats', authenticate, authorize('admin', 'super_admin'), async (_req, res, next) => {
  try {
    const [orders, revenue, pendingRx, lowStock, users, waitingCheck] = await Promise.all([
      queryOne<{ count: string }>(`SELECT COUNT(*) FROM orders WHERE DATE(created_at) = CURRENT_DATE AND deleted_at IS NULL`, []),
      queryOne<{ sum: string }>(`SELECT COALESCE(SUM(total_paise),0) as sum FROM orders WHERE DATE(created_at) = CURRENT_DATE AND status NOT IN ('pending_payment','payment_failed','cancelled')`, []),
      queryOne<{ count: string }>(`SELECT COUNT(*) FROM orders WHERE status = 'rx_pending'`, []),
      queryOne<{ count: string }>(`SELECT COUNT(*) FROM products p WHERE is_active=TRUE AND (SELECT COALESCE(SUM(quantity_available-quantity_reserved),0) FROM inventory_batches WHERE product_id=p.id AND NOT is_recalled) < 20`, []),
      queryOne<{ count: string }>(`SELECT COUNT(*) FROM users WHERE DATE(created_at) = CURRENT_DATE AND deleted_at IS NULL`, []),
      // Sprint 35: shipments (Dawabag's and partners') waiting for the pharmacist before packing (C-08)
      queryOne<{ count: string }>(`SELECT COUNT(*) FROM order_shipments s JOIN orders o ON o.id = s.order_id
        WHERE s.status = 'pending' AND s.pharmacist_check IN ('pending', 'held') AND o.status IN ('confirmed', 'packing', 'rx_verified')`, []),
    ]);

    const pipeline = await query(
      `SELECT status, COUNT(*) as count FROM orders WHERE deleted_at IS NULL GROUP BY status`,
      []
    );

    res.json({
      success: true,
      data: {
        today_orders: parseInt(orders?.count || '0'),
        today_revenue_paise: parseInt(revenue?.sum || '0'),
        pending_rx: parseInt(pendingRx?.count || '0'),
        low_stock_items: parseInt(lowStock?.count || '0'),
        new_users_today: parseInt(users?.count || '0'),
        waiting_pharmacist_check: parseInt(waitingCheck?.count || '0'),
        pipeline: pipeline.reduce((acc: any, row: any) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {}),
      },
    });
  } catch (e) { next(e); }
});

// ─── Admin Users ──────────────────────────────────────────────────────────────
// Sprint 32: who may be sold to from Dawabag's own stock and from each partner, by
// licence; warnings for the dashboard (C-07, C-33)
router.get('/selling-rights', authenticate, authorize('admin', 'super_admin'), async (_req, res, next) => {
  try { res.json({ success: true, data: await sellingRightsStatus() }); } catch (err) { next(err); }
});

router.get('/users', authenticate, authorize('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { role, search, page = '1' } = req.query;
    const limit = 20;
    const offset = (parseInt(page as string) - 1) * limit;

    const conditions: string[] = ['u.deleted_at IS NULL'];
    const params: any[] = [];
    let idx = 1;

    if (role) { conditions.push(`u.role = $${idx++}`); params.push(role); }
    if (search) {
      conditions.push(`(u.mobile ILIKE $${idx} OR up.full_name ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }

    const users = await query(
      `SELECT u.id, u.mobile, u.email, u.role, u.is_active, u.mobile_verified,
              u.created_at, up.full_name
       FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    res.json({ success: true, data: users });
  } catch (e) { next(e); }
});

router.patch('/users/:userId/status', authenticate, authorize('super_admin'), async (req, res, next) => {
  try {
    const { is_active } = req.body;
    await query('UPDATE users SET is_active = $1 WHERE id = $2', [is_active, req.params.userId]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ─── Sprint 2: credit accounts and scheduled jobs ────────────────────────────
router.patch('/users/:userId/credit', authenticate, authorize('admin', 'super_admin'), setCreditLimit);
router.get('/credit/open', authenticate, authorize('admin', 'super_admin'), listOpenCredit);
router.get('/jobs', authenticate, authorize('admin', 'super_admin'), listJobs);
router.get('/notification-deliveries', authenticate, authorize('admin', 'super_admin'), getDeliveries);
router.post('/jobs/:name/run', authenticate, authorize('super_admin'), runJobNow);

// ─── Sprint 3: marketplace, settlements, settings ───────────────────────────
const managers = authorize('admin', 'super_admin');
// Sprint 28: the admin onboards a partner (approved at once), edits it, adds logins
// Sprint 30: drug licences of partners, suppliers and buyers — work list, checks, scans.
// Pharmacists (KYC reviewers) see and check buyer licences only (the controller enforces it).
const licenceReviewers = authorize('admin', 'super_admin', 'pharmacist_rx');
router.get('/party-licences', authenticate, licenceReviewers, getPartyLicences);
router.post('/party-licences/:id/decision', authenticate, licenceReviewers, postLicenceDecision);
router.get('/party-licences/:id/document-url', authenticate, licenceReviewers, getAdminLicenceDocument);
router.post('/party-licences/:id/document', authenticate, managers, licenceUpload.single('file'), postAdminLicenceDocument);
router.get('/partners', authenticate, managers, getPartners);
router.post('/partners', authenticate, managers, postPartner);
router.get('/partners/:vendorId', authenticate, managers, getPartnerDetail);
router.put('/partners/:vendorId', authenticate, managers, putPartner);
router.post('/partners/:vendorId/logins', authenticate, managers, postPartnerLogin);
router.post('/partners/:vendorId/users', authenticate, managers, linkPartnerUser);
router.put('/partners/:vendorId/commission', authenticate, managers, setCommission);
// Sprint 36: stock-feed API keys of a partner (shown once; hash only stored; audited C-46)
router.get('/partners/:vendorId/api-keys', authenticate, managers, adminGetKeys);
router.post('/partners/:vendorId/api-keys', authenticate, managers, adminPostKey);
router.post('/partners/:vendorId/api-keys/:keyId/revoke', authenticate, managers, adminRevokeKey);
// Sprint 37: live stock feed — mode (manual / live, opt-in) and staleness per partner; urgent counts; checks (read-only)
router.get('/partners/:vendorId/stock-feed', authenticate, managers, getAdminPartnerFeed);
router.put('/partners/:vendorId/stock-feed', authenticate, managers, putAdminPartnerFeed);
router.get('/stock-feeds/alerts', authenticate, managers, getAdminFeedAlerts);
router.get('/stock-feeds/checks', authenticate, managers, getAdminChecks);
// Partner stock imports (Sprint 27): read-only for admins; new-product requests resolved here
router.get('/partner-stock-imports', authenticate, managers, adminListStockImports);
router.get('/partner-stock-imports/:id', authenticate, managers, adminGetStockImport);
router.get('/partner-stock-imports/:id/rows', authenticate, managers, adminGetStockImportRows);
router.get('/partner-product-requests', authenticate, managers, adminListProductRequests);
// Sprint 29: many requests → draft products for the pharmacist to complete
router.post('/partner-product-requests/drafts', authenticate, managers, postCreateDrafts);
router.post('/partner-product-requests/:id/resolve', authenticate, managers, adminResolveProductRequest);
router.post('/shipments/:id/delivered', authenticate, managers, postShipmentDelivered);
router.get('/settlements', authenticate, managers, getSettlements);
router.post('/settlements/generate', authenticate, managers, postGenerateSettlements);
router.get('/settlements/:id', authenticate, managers, getSettlementDetail);
router.post('/settlements/:id/pay', authenticate, managers, postSettlementPaid);
router.get('/settings', authenticate, managers, getSettings);
router.put('/settings/:key', authenticate, authorize('super_admin'), putSetting);
// Sprint 38: emergency stop for prescription-medicine sales (super-admin; audited) and the audit-log chain check
router.get('/emergency-stop', authenticate, authorize('admin', 'super_admin'), getEmergencyStop);
router.post('/emergency-stop/pause', authenticate, authorize('super_admin'), postPause);
router.post('/emergency-stop/resume', authenticate, authorize('super_admin'), postResume);
// Sprint 42: two-step sign-in of staff and partner logins — admins see it, a super-admin resets a lost authenticator (audited)
router.get('/two-factor', authenticate, authorize('admin', 'super_admin'), getTwoFactorOverview);
router.post('/two-factor/:userId/reset', authenticate, authorize('super_admin'), postTwoFactorReset);
router.get('/audit-chain/verify', authenticate, authorize('admin', 'super_admin'), getAuditChainVerify);
// Sprint 40: recorded chain heads (truncation check) and a manual run of the nightly chain check (C-09, C-46)
router.get('/chain-heads', authenticate, authorize('admin', 'super_admin'), async (_req, res, next) => {
  try { res.json({ success: true, data: await latestHeads() }); } catch (err) { next(err); }
});
router.post('/chain-heads/verify', authenticate, authorize('admin', 'super_admin'), async (req, res, next) => {
  try { res.json({ success: true, data: await runChainVerify({ source: 'manual', userId: req.user!.id }) }); } catch (err) { next(err); }
});
// Sprint 40: integrations missing on this server (e.g. SMS for sign-in codes), for the dashboard
router.get('/config-warnings', authenticate, authorize('admin', 'super_admin'), async (_req, res, next) => {
  try { res.json({ success: true, data: { warnings: await configWarnings() } }); } catch (err) { next(err); }
});
// Sprint 49: the live launch checklist (computed items + admin-kept manual items, audited; C-46)
router.get('/launch-readiness', authenticate, authorize('admin', 'super_admin'), getLaunchReadiness);
router.put('/launch-readiness/manual/:key', authenticate, authorize('admin', 'super_admin'), putManualItem);
router.patch('/users/:userId/pharmacist', authenticate, authorize('admin', 'super_admin'), setPharmacistRegistration);

export default router;
