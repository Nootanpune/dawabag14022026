import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { query, queryOne } from '../config/database';
import { AppError } from '../utils/AppError';

const router = Router();

const adminOnly = authorize('admin', 'super_admin');
const staffOrAdmin = authorize('pharmacist_rx', 'pharmacist_pack', 'delivery', 'admin', 'super_admin');

// ─── Inventory ───────────────────────────────────────────────────────────────
router.get('/inventory', authenticate, staffOrAdmin, async (req, res, next) => {
  try {
    const { product_id, low_stock, near_expiry } = req.query;
    let whereClause = '1=1';
    const params: any[] = [];
    let idx = 1;

    if (product_id) { whereClause += ` AND b.product_id = $${idx++}`; params.push(product_id); }
    if (low_stock === 'true') { whereClause += ` AND b.quantity_available < 20`; }
    if (near_expiry === 'true') { whereClause += ` AND b.expiry_date < CURRENT_DATE + 90`; }

    const batches = await query(
      `SELECT b.*, p.name as product_name, p.sku, p.cold_chain, p.drug_schedule,
              v.name as vendor_name
       FROM inventory_batches b
       JOIN products p ON p.id = b.product_id
       LEFT JOIN vendors v ON v.id = b.vendor_id
       WHERE ${whereClause}
       ORDER BY b.expiry_date ASC
       LIMIT 100 OFFSET 0`,
      params
    );
    res.json({ success: true, data: batches });
  } catch (e) { next(e); }
});

router.post('/inventory/batch', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { product_id, vendor_id, batch_number, quantity, purchase_price_paise, expiry_date, manufactured_date } = req.body;
    if (!product_id || !batch_number || !quantity || !expiry_date) {
      throw new AppError('Required fields missing', 400);
    }
    const batch = await queryOne(
      `INSERT INTO inventory_batches (product_id, vendor_id, batch_number, quantity_available, purchase_price_paise, expiry_date, manufactured_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [product_id, vendor_id || null, batch_number, quantity, purchase_price_paise || 0, expiry_date, manufactured_date || null]
    );
    res.status(201).json({ success: true, data: batch });
  } catch (e) { next(e); }
});

// ─── Vendors ──────────────────────────────────────────────────────────────────
router.get('/vendors', authenticate, adminOnly, async (_req, res, next) => {
  try {
    const vendors = await query('SELECT * FROM vendors WHERE is_active = TRUE ORDER BY name', []);
    res.json({ success: true, data: vendors });
  } catch (e) { next(e); }
});

router.post('/vendors', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { name, drug_license_no, gst_number, gst_type, contact_name, contact_mobile, contact_email, payment_terms, avg_delivery_days } = req.body;
    if (!name || !drug_license_no) throw new AppError('Name and drug license required', 400);
    const vendor = await queryOne(
      `INSERT INTO vendors (name, drug_license_no, gst_number, gst_type, contact_name, contact_mobile, contact_email, payment_terms, avg_delivery_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [name, drug_license_no, gst_number || null, gst_type || 'regular', contact_name || null, contact_mobile || null, contact_email || null, payment_terms || 'prepaid', avg_delivery_days || 3]
    );
    res.status(201).json({ success: true, data: vendor });
  } catch (e) { next(e); }
});

// ─── Purchase Orders ──────────────────────────────────────────────────────────
router.get('/purchase-orders', authenticate, adminOnly, async (_req, res, next) => {
  try {
    const pos = await query(
      `SELECT po.*, v.name as vendor_name, COUNT(pi.id) as item_count
       FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id
       LEFT JOIN po_items pi ON pi.po_id = po.id
       GROUP BY po.id, v.name ORDER BY po.raised_at DESC LIMIT 50`,
      []
    );
    res.json({ success: true, data: pos });
  } catch (e) { next(e); }
});

router.post('/purchase-orders', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { vendor_id, items, expected_by, notes } = req.body;
    if (!vendor_id || !items?.length) throw new AppError('Vendor and items required', 400);

    const poNumber = `PO-${Date.now().toString().slice(-8)}`;
    let totalPaise = 0;
    items.forEach((i: any) => { totalPaise += i.quantity * i.unit_price_paise; });

    const po = await queryOne(
      `INSERT INTO purchase_orders (vendor_id, po_number, status, total_amount_paise, notes, raised_by, expected_by)
       VALUES ($1,$2,'draft',$3,$4,$5,$6) RETURNING id, po_number`,
      [vendor_id, poNumber, totalPaise, notes || null, req.user!.id, expected_by || null]
    );

    for (const item of items) {
      await query(
        `INSERT INTO po_items (po_id, product_id, quantity, unit_price_paise, gst_rate, total_paise)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [po!.id, item.product_id, item.quantity, item.unit_price_paise, item.gst_rate || 12, item.quantity * item.unit_price_paise]
      );
    }

    res.status(201).json({ success: true, data: po });
  } catch (e) { next(e); }
});

export { router as inventoryRouter, router as vendorRouter, router as purchaseOrderRouter };
export default router;
