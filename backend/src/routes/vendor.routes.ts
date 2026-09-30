import { Router, Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { AppError } from '../utils/AppError';
import { VendorApprovalService } from '../services/vendor.service';
import { logger } from '../config/logger';

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
    const { drug_license_type, drug_license_expiry, vendor_type } = req.body;
    if (!drug_license_type || !drug_license_expiry) throw new AppError('drug_license_type and drug_license_expiry required', 400);
    await VendorApprovalService.approveVendor({
      vendorId: req.params.id, adminId: req.user!.id,
      drugLicenseType: drug_license_type, drugLicenseExpiry: drug_license_expiry,
      vendorType: vendor_type || 'supplier',
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

// Partner product review queue
router.get('/partner-products/pending', authenticate, authorize('admin','super_admin','pharmacist_rx'), async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT pp.*, v.name AS partner_name, v.pincode, v.vendor_rating
       FROM partner_products pp JOIN vendors v ON pp.partner_id = v.id
       WHERE pp.approval_status = 'pending' ORDER BY pp.submission_date ASC`
    );
    res.json({ success: true, data: { count: result.rows.length, products: result.rows } });
  } catch (err) { next(err); }
});

// Approve partner product
router.post('/partner-products/:id/approve', authenticate, authorize('admin','super_admin','pharmacist_rx'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await pool.query(
      `UPDATE partner_products SET approval_status='approved', listing_status='pending',
       product_id=$1, reviewed_by=$2, reviewed_at=NOW(), updated_at=NOW() WHERE id=$3`,
      [req.body.product_id||null, req.user!.id, req.params.id]
    );
    res.json({ success: true, data: { message: 'Product approved. Post live when ready.' } });
  } catch (err) { next(err); }
});

// Reject partner product
router.post('/partner-products/:id/reject', authenticate, authorize('admin','super_admin','pharmacist_rx'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rejection_reason_code, rejection_details } = req.body;
    if (!rejection_reason_code) throw new AppError('rejection_reason_code required (e.g. REJ-01)', 400);
    await pool.query(
      `UPDATE partner_products SET approval_status='rejected', listing_status='not_listed',
       rejection_reason_code=$1, rejection_details=$2, reviewed_by=$3, reviewed_at=NOW() WHERE id=$4`,
      [rejection_reason_code, rejection_details||null, req.user!.id, req.params.id]
    );
    res.json({ success: true, data: { message: `Rejected (${rejection_reason_code})` } });
  } catch (err) { next(err); }
});

// Post approved product live on portal
router.post('/partner-products/:id/post-live', authenticate, authorize('admin','super_admin'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await pool.query(
      `UPDATE partner_products SET listing_status='live', posted_at=NOW(), posted_by=$1, updated_at=NOW()
       WHERE id=$2 AND approval_status='approved' RETURNING medicine_name`,
      [req.user!.id, req.params.id]
    );
    if (!result.rows[0]) throw new AppError('Product not found or not approved', 400);
    res.json({ success: true, data: { message: `${result.rows[0].medicine_name} is now live on portal` } });
  } catch (err) { next(err); }
});

// Pending settlements
router.get('/settlements/pending', authenticate, authorize('admin','super_admin'), async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT poi.partner_id, v.name AS partner_name,
              COUNT(poi.id) AS unfulfilled_orders,
              SUM(poi.supply_price_paise * poi.allocated_qty) AS gross_value_paise,
              SUM(poi.net_payable_paise) AS total_net_payable_paise
       FROM partner_order_items poi JOIN vendors v ON poi.partner_id = v.id
       WHERE poi.dispatch_status = 'delivered' AND poi.settlement_batch_id IS NULL
       GROUP BY poi.partner_id, v.name ORDER BY total_net_payable_paise DESC`
    );
    res.json({ success: true, data: { partners: result.rows } });
  } catch (err) { next(err); }
});

export default router;
