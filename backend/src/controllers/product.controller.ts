import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../config/database';
import { cacheGet, cacheSet } from '../config/redis';
import { AppError } from '../utils/AppError';

// ─── Search Products ─────────────────────────────────────────────────────────
export async function searchProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const q = (req.query.q as string || '').trim();
    const category = req.query.category as string;
    const schedule = req.query.schedule as string;
    const pincode = req.query.pincode as string;
    const page = Math.max(1, parseInt(req.query.page as string || '1'));
    const limit = Math.min(50, parseInt(req.query.limit as string || '20'));
    const offset = (page - 1) * limit;

    // Check pincode serviceability
    let pincodeData: any = null;
    if (pincode) {
      pincodeData = await queryOne(
        'SELECT is_serviceable, estimated_days, shipping_charge_paise FROM pincode_serviceability WHERE pincode = $1',
        [pincode]
      );
    }

    // Schedule X and NDPS can never be sold online, so they are not listed (Rulebook C-10)
    const conditions: string[] = [
      'p.is_active = TRUE', 'p.deleted_at IS NULL',
      "COALESCE(p.drug_schedule, '') NOT IN ('Schedule X', 'NDPS')",
    ];
    const params: any[] = [];
    let paramIdx = 1;

    if (q) {
      conditions.push(`p.search_vector @@ plainto_tsquery('english', $${paramIdx})`);
      params.push(q);
      paramIdx++;
    }

    if (category) {
      conditions.push(`p.category = $${paramIdx}`);
      params.push(category);
      paramIdx++;
    }

    if (schedule) {
      conditions.push(`p.drug_schedule = $${paramIdx}`);
      params.push(schedule);
      paramIdx++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = q
      ? `ORDER BY ts_rank(p.search_vector, plainto_tsquery('english', $1)) DESC`
      : 'ORDER BY p.name ASC';

    // GAP-01 fix: return correct price + qty based on customer type
    const customerType = req.user?.pricing_type ?? 'customer';
    const displayPrice = customerType === 'b2b_retailer'
      ? 'COALESCE(p.ptr_price_paise, p.offer_price_paise)'
      : customerType === 'b2b_wholesaler'
      ? 'COALESCE(p.pts_price_paise, p.offer_price_paise)'
      : customerType === 'doc_hospital'
      ? 'COALESCE(p.institutional_price_paise, p.offer_price_paise)'
      : 'p.offer_price_paise';
    const minQtyExpr = customerType === 'b2b_retailer'
      ? 'COALESCE(p.min_order_qty_retailer, 1)'
      : customerType === 'b2b_wholesaler'
      ? 'COALESCE(p.min_order_qty_wholesaler, 10)'
      : '1';
    const maxQtyExpr = customerType === 'b2b_retailer'
      ? 'COALESCE(p.max_qty_per_order_retailer, p.max_qty_per_order)'
      : customerType === 'b2b_wholesaler'
      ? 'COALESCE(p.max_qty_per_order_wholesaler, 9999)'
      : 'p.max_qty_per_order';

    const products = await query(
      `SELECT p.id, p.name, p.generic_name, p.sku, p.category,
              p.drug_schedule, p.marketed_by, p.mrp_paise,
              p.offer_price_paise, p.cold_chain, p.s3_image_key, p.gst_rate,
              (${displayPrice}) AS display_price_paise,
              (${minQtyExpr}) AS min_order_qty,
              (${maxQtyExpr}) AS max_order_qty,
              COALESCE(p.reorder_level_qty, 0) AS reorder_level_qty,
              COALESCE(SUM(b.quantity_available - b.quantity_reserved), 0) AS stock_qty
       FROM products p
       LEFT JOIN inventory_batches b ON b.product_id = p.id
         AND b.expiry_date > CURRENT_DATE + 30
       ${whereClause}
       GROUP BY p.id
       ${orderClause}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    const totalResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) FROM products p ${whereClause}`,
      params
    );

    res.json({
      success: true,
      data: {
        products: products.map((p) => ({
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
          total: parseInt(totalResult?.count || '0'),
          pages: Math.ceil(parseInt(totalResult?.count || '0') / limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ─── Get Product Detail ───────────────────────────────────────────────────────
export async function getProductDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { productId } = req.params;
    const cacheKey = `product:${productId}`;

    const cached = await cacheGet(cacheKey);
    if (cached) return res.json({ success: true, data: cached });

    const product = await queryOne(
      `SELECT p.*,
              COALESCE(SUM(b.quantity_available - b.quantity_reserved), 0) as stock_qty,
              MIN(b.expiry_date) as nearest_expiry
       FROM products p
       LEFT JOIN inventory_batches b ON b.product_id = p.id
         AND b.expiry_date > CURRENT_DATE + 30
       WHERE p.id = $1 AND p.is_active = TRUE AND p.deleted_at IS NULL
       GROUP BY p.id`,
      [productId]
    );

    if (!product) throw new AppError('Product not found', 404);

    const result = {
      ...product,
      in_stock: parseInt(product.stock_qty) > 0,
      discount_pct: Math.round(
        ((product.mrp_paise - product.offer_price_paise) / product.mrp_paise) * 100
      ),
      requires_prescription: ['Schedule H', 'Schedule H1'].includes(product.drug_schedule),
      cannot_order_online: ['NDPS', 'Schedule X'].includes(product.drug_schedule),
    };

    await cacheSet(cacheKey, result, 300);
    res.json({ success: true, data: result });
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
       FROM products WHERE is_active = TRUE AND deleted_at IS NULL
       GROUP BY category ORDER BY category`,
      []
    );

    await cacheSet('categories', categories, 3600);
    res.json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
}

// ─── Admin: Create Product ────────────────────────────────────────────────────
export async function createProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const schema = z.object({
      name: z.string().min(2).max(500),
      generic_name: z.string().optional(),
      sku: z.string().min(3).max(100),
      category: z.string().min(2),
      drug_schedule: z.enum(['OTC', 'Schedule G', 'Schedule H', 'Schedule H1', 'Schedule X', 'NDPS']),
      hsn_code: z.string().optional(),
      gst_rate: z.number().int().min(0).max(28),
      marketed_by: z.string().optional(),
      description: z.string().optional(),
      composition: z.string().optional(),
      storage_instructions: z.string().optional(),
      cold_chain: z.boolean().default(false),
      mrp_paise: z.number().int().positive(),
      offer_price_paise: z.number().int().positive(),
      max_qty_per_order: z.number().int().min(1).default(3),
    });

    const data = schema.parse(req.body);

    if (data.offer_price_paise > data.mrp_paise) {
      throw new AppError('Offer price cannot exceed MRP', 400);
    }

    const existing = await queryOne('SELECT id FROM products WHERE sku = $1', [data.sku]);
    if (existing) throw new AppError('SKU already exists', 409);

    const product = await queryOne(
      `INSERT INTO products (
         name, generic_name, sku, category, drug_schedule, hsn_code,
         gst_rate, marketed_by, description, composition, storage_instructions,
         cold_chain, mrp_paise, offer_price_paise, max_qty_per_order
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        data.name, data.generic_name || null, data.sku, data.category,
        data.drug_schedule, data.hsn_code || null, data.gst_rate,
        data.marketed_by || null, data.description || null,
        data.composition || null, data.storage_instructions || null,
        data.cold_chain, data.mrp_paise, data.offer_price_paise,
        data.max_qty_per_order,
      ]
    );

    res.status(201).json({ success: true, data: product });
  } catch (error) {
    next(error);
  }
}

// ─── Admin: Update Product ────────────────────────────────────────────────────
export async function updateProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { productId } = req.params;
    const allowed = [
      'name', 'generic_name', 'category', 'drug_schedule', 'hsn_code',
      'gst_rate', 'marketed_by', 'description', 'composition',
      'cold_chain', 'mrp_paise', 'offer_price_paise', 'max_qty_per_order',
      'is_active', 'storage_instructions',
    ];

    const updates = Object.entries(req.body)
      .filter(([key]) => allowed.includes(key))
      .reduce((acc, [key, val]) => ({ ...acc, [key]: val }), {} as Record<string, any>);

    if (Object.keys(updates).length === 0) {
      throw new AppError('No valid fields to update', 400);
    }

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
    const values = [productId, ...Object.values(updates)];

    await query(
      `UPDATE products SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $1`,
      values
    );

    // Invalidate cache
    const { cacheDel } = await import('../config/redis');
    await cacheDel(`product:${productId}`);

    res.json({ success: true, message: 'Product updated' });
  } catch (error) {
    next(error);
  }
}
