import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { AppError } from '../utils/AppError';
import { VendorApprovalService } from '../services/vendor.service';
import { logger } from '../config/logger';
import { getReviewQueue, postApproveListing, postListingLive, postRejectListing } from '../controllers/marketplaceAdmin.controller';

const router = Router();

// List vendors (admin)
router.get('/', authenticate, authorize('admin','super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, status } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let pi = 1;
    if (type)   { conditions.push(`vendor_type = $${pi}`);       params.push(type);   pi++; }
    if (status) { conditions.push(`approval_status = $${pi}`);   params.push(status); pi++; }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT id, name, drug_license_no, gst_number, contact_name, contact_mobile,
              vendor_type, approval_status, vendor_rating, pincode, city, state,
              total_orders_fulfilled, on_time_dispatch_pct, return_rate_pct, created_at
       FROM vendors ${where} ORDER BY created_at DESC LIMIT 50`,
      params
    );
    res.json({ success: true, data: { vendors: result.rows } });
  } catch (err) { next(err); }
});

// Pending approval queue
router.get('/pending-approval', authenticate, authorize('admin','super_admin'), async (_req, res, next) => {
  try {
    const vendors = await VendorApprovalService.getPendingVendors();
    res.json({ success: true, data: { count: vendors.length, vendors } });
  } catch (err) { next(err); }
});

// Approve vendor
router.post('/:id/approve', authenticate, authorize('admin','super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { drug_license_type, drug_license_expiry, vendor_type, invoice_prefix } = req.body;
    if (!drug_license_type || !drug_license_expiry) throw new AppError('drug_license_type and drug_license_expiry required', 400);
    await VendorApprovalService.approveVendor({
      vendorId: req.params.id, adminId: req.user!.id,
      drugLicenseType: drug_license_type, drugLicenseExpiry: drug_license_expiry,
      vendorType: vendor_type || 'supplier', invoicePrefix: invoice_prefix,
    });
    res.json({ success: true, data: { message: 'Vendor approved', vendor_id: req.params.id } });
  } catch (err) { next(err); }
});

// Reject vendor
router.post('/:id/reject', authenticate, authorize('admin','super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rejection_reason } = req.body;
    if (!rejection_reason) throw new AppError('rejection_reason required', 400);
    await VendorApprovalService.rejectVendor({ vendorId: req.params.id, adminId: req.user!.id, rejectionReason: rejection_reason });
    res.json({ success: true, data: { message: 'Vendor rejected' } });
  } catch (err) { next(err); }
});

// Vendor performance / rating history
router.get('/:id/performance', authenticate, authorize('admin','super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const current = await pool.query(
      `SELECT vendor_rating, total_orders_received, total_orders_fulfilled,
              on_time_dispatch_pct, return_rate_pct, avg_dispatch_hours
       FROM vendors WHERE id = $1`, [req.params.id]
    );
    if (!current.rows[0]) throw new AppError('Vendor not found', 404);
    const history = await pool.query(
      `SELECT period_month, orders_received, orders_fulfilled, calculated_rating
       FROM vendor_performance_history WHERE vendor_id = $1 ORDER BY period_month DESC LIMIT 12`,
      [req.params.id]
    );
    res.json({ success: true, data: { current: current.rows[0], history: history.rows } });
  } catch (err) { next(err); }
});

// Partner listing review — controllers/marketplaceAdmin.controller.ts
const reviewers = authorize('admin', 'super_admin', 'pharmacist_rx');
router.get('/partner-products/pending', authenticate, reviewers, getReviewQueue);
router.post('/partner-products/:id/approve', authenticate, reviewers, postApproveListing);
router.post('/partner-products/:id/reject', authenticate, reviewers, postRejectListing);
router.post('/partner-products/:id/post-live', authenticate, authorize('admin', 'super_admin'), postListingLive);

export default router;
