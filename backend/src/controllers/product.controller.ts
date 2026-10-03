import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne, withTransaction } from '../config/database';
import { cacheGet, cacheSet } from '../config/redis';
import { AppError } from '../utils/AppError';
import { writeAudit } from '../utils/audit';
import { assertBelowShelfMrp } from '../services/shelfMrp';
import { productDetail } from '../services/productDetail.service';
import { adminGetProduct, adminListProducts } from '../services/productAdmin.service';
import { COPY_FIELDS, contentQueue, copyFlags, reviewContent } from '../services/productContent.service';
import { withImageUrls } from '../services/productImage.service';
import { parseSearchSort, searchCatalogue } from '../services/search/productSearch.service';
import { didYouMean } from '../services/search/didYouMean';
import { registerFromProductForm } from '../services/catalogueLists/lists.service';
import { SCHEDULES } from '../services/catalogueDrafts/rules';

// ─── Search Products ─────────────────────────────────────────────────────────
export async function searchProducts(req: Request, res: Response, next: NextFunction) {
  try {
    // One text value each (a repeated ?q= arrives as an array); page/limit always whole
    // numbers in range — a bad value no longer reaches SQL as NaN (security review Sprint 34)
    const one = (v: unknown) => (typeof v === 'string' ? v : undefined);
    const whole = (v: unknown, dflt: number, max: number) => {
      const n = parseInt(one(v) ?? '', 10);
      return Number.isFinite(n) ? Math.min(max, Math.max(1, n)) : dflt;
    };
    const q = (one(req.query.q) ?? '').trim().slice(0, 200);
    const category = one(req.query.category)?.slice(0, 100) as string;
    const schedule = one(req.query.schedule)?.slice(0, 40) as string;
    const pincode = one(req.query.pincode)?.slice(0, 10) as string;
    const page = whole(req.query.page, 1, 10_000);
    const limit = whole(req.query.limit, 20, 50);
    const offset = (page - 1) * limit;

    // Check pincode serviceability
    let pincodeData: any = null;
    if (pincode) {
      pincodeData = await queryOne(
        'SELECT is_serviceable, estimated_days, shipping_charge_paise FROM pincode_serviceability WHERE pincode = $1',
        [pincode]
      );
    }

    // Matching, ranking and the listing rules (C-10) live in services/search
    const { products, total } = await searchCatalogue({
      q, category, schedule, pricingType: req.user?.pricing_type ?? 'customer', limit, offset,
      sort: parseSearchSort(req.query.sort),   // optional; relevance by default (Sprint 25)
    });

    res.json({
      success: true,
      data: {
        // Pack photo only once the pharmacist approved it (C-19)
        products: (await withImageUrls(products, 'approved_image_key')).map((p: any) => ({
          ...p,
          in_stock: parseInt(p.stock_qty) > 0,
          discount_pct: Math.round(
            ((p.mrp_paise - p.offer_price_paise) / p.mrp_paise) * 100
          ),
        })),
        pincode_info: pincodeData,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// GET /products/search/suggest?q= — "Did you mean" for a search that found nothing:
// up to 3 names close to what was typed, from sellable products only (C-10)
export async function getSearchSuggestions(req: Request, res: Response, next: NextFunction) {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    res.json({ success: true, data: { suggestions: await didYouMean(q) } });
  } catch (error) {
    next(error);
  }
}

// ─── Get Product Detail ───────────────────────────────────────────────────────
export async function getProductDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = z.string().uuid().parse(req.params.productId);
    res.json({ success: true, data: await productDetail(productId, req.user?.pricing_type ?? 'customer') });
  } catch (error) {
    next(error);
  }
}

// ─── Get Categories ───────────────────────────────────────────────────────────
export async function getCategories(req: Request, res: Response, next: NextFunction) {
  try {
    const cached = await cacheGet('categories');
    if (cached) return res.json({ success: true, data: cached });

    const categories = await query(
      `SELECT category, COUNT(*) as product_count
       FROM products WHERE is_active = TRUE AND deleted_at IS NULL AND online_sale_status = 'permitted'
       GROUP BY category ORDER BY category`,
      []
    );

    await cacheSet('categories', categories, 3600);
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
}

// ─── Admin: catalogue fields ──────────────────────────────────────────────────
// Catalogue fields admins may set. Every selling price must be ≤ MRP and MRP
// ≤ the NPPA ceiling where one applies (C-16); the database enforces the same.
const priceField = z.number().int().positive();
const productFields = {
  name: z.string().min(2).max(500),
  generic_name: z.string().max(500).nullable().optional(),
  category: z.string().min(2).max(100),
  drug_schedule: z.enum(SCHEDULES),   // incl. 'Non-scheduled' (Sprint 31)
  hsn_code: z.string().regex(/^\d{4,8}$/, 'HSN must be 4–8 digits').nullable().optional(),
  gst_rate: z.number().int().min(0).max(28),
  marketed_by: z.string().max(255).nullable().optional(),
  description: z.string().nullable().optional(),
  composition: z.string().nullable().optional(),
  storage_instructions: z.string().nullable().optional(),
  cold_chain: z.boolean(),
  // Sprint 34: Drugs Rules Schedule C / C1 — sold only under Form 21 / 21B (stock/sellingRights.ts, C-07, C-33)
  schedule_c_c1: z.boolean(),
  mrp_paise: priceField,
  offer_price_paise: priceField,
  ptr_price_paise: priceField.nullable().optional(),
  pts_price_paise: priceField.nullable().optional(),
  institutional_price_paise: priceField.nullable().optional(),
  nppa_ceiling_price_paise: priceField.nullable().optional(),
  max_qty_per_order: z.number().int().min(1),
  min_order_qty_retailer: z.number().int().min(1),
  min_order_qty_wholesaler: z.number().int().min(1),
  reorder_level_qty: z.number().int().min(0),
  is_active: z.boolean(),
  // Pre-packed goods declarations shown on the product page (C-17)
  net_quantity: z.string().trim().min(1).max(50),
  manufacturer_name: z.string().trim().min(2).max(255),
  manufacturer_address: z.string().trim().min(5).max(1000),
  country_of_origin: z.string().trim().min(2).max(60),
};

const createSchema = z.object({
  ...productFields,
  sku: z.string().min(3).max(100),
  cold_chain: productFields.cold_chain.default(false),
  schedule_c_c1: productFields.schedule_c_c1.default(false),
  max_qty_per_order: productFields.max_qty_per_order.default(3),
  min_order_qty_retailer: productFields.min_order_qty_retailer.default(1),
  min_order_qty_wholesaler: productFields.min_order_qty_wholesaler.default(10),
  reorder_level_qty: productFields.reorder_level_qty.default(10),
  is_active: productFields.is_active.default(true),
  country_of_origin: productFields.country_of_origin.default('India'),
});
const updateSchema = z.object(productFields).partial().strict();

const PRICE_KEYS = ['mrp_paise', 'offer_price_paise', 'ptr_price_paise', 'pts_price_paise',
  'institutional_price_paise', 'nppa_ceiling_price_paise'] as const;

function assertPrices(p: Record<string, any>) {
  for (const k of ['offer_price_paise', 'ptr_price_paise', 'pts_price_paise', 'institutional_price_paise']) {
    if (p[k] != null && p[k] > p.mrp_paise) throw new AppError(`${k.replace('_paise', '').replace(/_/g, ' ')} cannot exceed MRP`, 400);
  }
  if (p.nppa_ceiling_price_paise != null && p.mrp_paise > p.nppa_ceiling_price_paise) {
    throw new AppError('MRP cannot exceed the NPPA ceiling price', 400);
  }
}

// ─── Admin: Create Product ────────────────────────────────────────────────────
export async function createProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createSchema.parse(req.body);
    assertPrices(data);

    const existing = await queryOne('SELECT id FROM products WHERE sku = $1', [data.sku]);
    if (existing) throw new AppError('SKU already exists', 409);
    // Category / HSN spelled as in their lists; a new one is added with an audit entry (Sprint 31, C-46)
    Object.assign(data, await withTransaction((c) => registerFromProductForm(c, req.user!.id, data)));

    // New copy waits for the pharmacist (C-19); likely forbidden claims are flagged for them
    const row: Record<string, unknown> = { ...data, content_status: 'pending_review', content_flags: JSON.stringify(copyFlags(data)) };
    const cols = Object.keys(row);
    const product = await queryOne<{ id: string; online_sale_status: string }>(
      // Sprint 39: a new product starts 'restricted' (database default) until a pharmacist allows online sale (C-10)
      `INSERT INTO products (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id, online_sale_status`,
      Object.values(row));
    await writeAudit({ userId: null, action: 'product_created', performedBy: req.user!.id,
      newValue: { product_id: product!.id, sku: data.sku, ...Object.fromEntries(PRICE_KEYS.map((k) => [k, (data as any)[k] ?? null])) } });

    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
}

// ─── Admin: Update Product ────────────────────────────────────────────────────
export async function updateProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = z.string().uuid().parse(req.params.productId);
    const updates = updateSchema.parse(req.body);
    if (Object.keys(updates).length === 0) throw new AppError('No valid fields to update', 400);

    const before = await queryOne<Record<string, any>>('SELECT * FROM products WHERE id = $1', [productId]);
    if (!before) throw new AppError('Product not found', 404);
    // Drafts go live only through pharmacist approval; Schedule X / NDPS drafts never (Sprint 29, C-10, C-19)
    if (updates.is_active === true && before.catalogue_state !== 'live') {
      throw new AppError(before.catalogue_state === 'draft'
        ? 'A new product goes on sale only when a pharmacist approves it in "New products to complete" (C-19)'
        : 'This product can never be listed online (C-10)', 409);
    }
    assertPrices({ ...before, ...updates });
    await assertBelowShelfMrp(productId, { ...before, ...updates });
    // Category / HSN spelled as in their lists; a new one is added with an audit entry (Sprint 31, C-46)
    Object.assign(updates, await withTransaction((c) => registerFromProductForm(c, req.user!.id,
      { category: updates.category, hsn_code: updates.hsn_code, gst_rate: updates.gst_rate ?? before.gst_rate },
      { category: before.category, hsn_code: before.hsn_code })));

    // Changed copy goes back to the pharmacist (C-19)
    const copyChanged = COPY_FIELDS.some((k) => k in updates && (updates as any)[k] !== before[k]);
    const row: Record<string, unknown> = copyChanged
      ? { ...updates, content_status: 'pending_review', content_flags: JSON.stringify(copyFlags({ ...before, ...updates })) }
      : updates;
    const keys = Object.keys(row);
    await query(
      `UPDATE products SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE id = $1`,
      [productId, ...Object.values(row)]);

    // Audit price and listing changes (C-46)
    const changed = keys.filter((k) => before[k] !== (updates as any)[k]);
    if (changed.length) {
      await writeAudit({ userId: null, action: 'product_updated', performedBy: req.user!.id,
        oldValue: Object.fromEntries(changed.map((k) => [k, before[k]])),
        newValue: { product_id: productId, ...Object.fromEntries(changed.map((k) => [k, (updates as any)[k]])) } });
    }

    const { cacheDel } = await import('../config/redis');
    await cacheDel(`product:${productId}`);

    res.json({ success: true, message: 'Product updated' });
  } catch (error) {
    next(error);
  }
}

// ─── Pharmacist: product copy review (C-19) ───────────────────────────────────
export async function getContentQueue(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { products: await contentQueue() } }); } catch (error) { next(error); }
}

export async function postContentReview(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ approve: z.boolean(), notes: z.string().trim().min(3).max(1000) }).parse(req.body);
    res.json({ success: true, data: await reviewContent(req.user!.id, z.string().uuid().parse(req.params.productId), d.approve, d.notes) });
  } catch (error) { next(error); }
}

// ─── Admin catalogue view ─────────────────────────────────────────────────────
export async function getAdminProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      q: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20), status: z.enum(['active', 'inactive']).optional(),
    }).parse(req.query);
    res.json({ success: true, data: await adminListProducts(d.q || undefined, d.page, d.limit, d.status) });
  } catch (error) { next(error); }
}

export async function getAdminProduct(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await adminGetProduct(z.string().uuid().parse(req.params.productId)) }); } catch (error) { next(error); }
}

// POST /products/:productId/telemedicine-list — the pharmacist's classification under the
// Telemedicine Practice Guidelines 2020 (C-23). Schedule X / NDPS stay prohibited (database trigger).
export async function setTelemedicineList(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({ list: z.enum(['O', 'A', 'B', 'prohibited']), notes: z.string().trim().min(3).max(500) }).parse(req.body);
    const id = z.string().uuid().parse(req.params.productId);
    const ph = await queryOne<{ pharmacist_reg_no: string | null }>('SELECT pharmacist_reg_no FROM users WHERE id = $1', [req.user!.id]);
    if (!ph?.pharmacist_reg_no) throw new AppError('Add your pharmacy council registration number before classifying medicines', 403);
    const before = await queryOne<{ telemedicine_list: string | null }>('SELECT telemedicine_list FROM products WHERE id = $1', [id]);
    if (!before) throw new AppError('Product not found', 404);
    const after = await queryOne<{ telemedicine_list: string }>('UPDATE products SET telemedicine_list = $2, updated_at = NOW() WHERE id = $1 RETURNING telemedicine_list', [id, d.list]);
    await writeAudit({ userId: null, action: 'telemedicine_list_set', performedBy: req.user!.id,
      oldValue: { product_id: id, list: before.telemedicine_list }, newValue: { product_id: id, list: after!.telemedicine_list }, notes: d.notes });
    res.json({ success: true, data: { id, telemedicine_list: after!.telemedicine_list } });
  } catch (err) { next(err); }
}
