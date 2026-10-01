// src/scripts/demo/catalogue.ts — demo products, stock and pack shots, upserted by
// SKU (DEMO-…). Bulk rows go in by SQL like the catalogue import; the copy and the
// photo then pass the normal pharmacist content review (C-19) and the photo goes to
// the object store through the product-photo service (never to a local disk).
import { query, queryOne } from '../../config/database';
import { findRestrictedClaims } from '../../utils/claimsCheck';
import { reviewContent } from '../../services/productContent.service';
import { setProductImage } from '../../services/productImage.service';
import { isObjectStoreConfigured } from '../../services/storage.service';
import { cacheDel } from '../../config/redis';
import {
  DEMO_MANUFACTURER, DEMO_MANUFACTURER_ADDRESS, DEMO_MEDICINES, DEMO_SKU_PREFIX, DemoMedicine, storageFor,
} from './catalogueData';
import { packShotPng } from './packShot';

const paise = (rupees: number) => Math.round(rupees * 100);
const maxPerOrder = (m: DemoMedicine) => (m.schedule === 'Schedule H1' ? 2 : m.schedule === 'Schedule H' ? 5 : 10);

/** IST date `days` from today, as YYYY-MM-DD */
export const istDatePlus = (days: number) => new Date(Date.now() + 5.5 * 3600e3 + days * 864e5).toISOString().slice(0, 10);

async function upsertProduct(m: DemoMedicine): Promise<{ id: string; copyChanged: boolean; hasImage: boolean }> {
  const sku = DEMO_SKU_PREFIX + m.code;
  const before = await queryOne<{ id: string; description: string; composition: string; storage_instructions: string; content_status: string; s3_image_key: string | null }>(
    `SELECT id, description, composition, storage_instructions, content_status, s3_image_key FROM products WHERE sku = $1`, [sku]);
  const storage = storageFor(m);
  const offer = paise(m.offer);
  const row = (await query<{ id: string }>(
    `INSERT INTO products (name, generic_name, sku, category, drug_schedule, hsn_code, gst_rate, description, composition,
       storage_instructions, is_active, mrp_paise, offer_price_paise, ptr_price_paise, pts_price_paise, institutional_price_paise,
       max_qty_per_order, net_quantity, manufacturer_name, manufacturer_address, country_of_origin, marketed_by, telemedicine_list)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12,$13,$14,$15,$16,$17,$18,$19,'India',$18,$20)
     ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, generic_name = EXCLUDED.generic_name, category = EXCLUDED.category,
       drug_schedule = EXCLUDED.drug_schedule, hsn_code = EXCLUDED.hsn_code, gst_rate = EXCLUDED.gst_rate,
       description = EXCLUDED.description, composition = EXCLUDED.composition, storage_instructions = EXCLUDED.storage_instructions,
       is_active = TRUE, deleted_at = NULL, mrp_paise = EXCLUDED.mrp_paise, offer_price_paise = EXCLUDED.offer_price_paise,
       ptr_price_paise = EXCLUDED.ptr_price_paise, pts_price_paise = EXCLUDED.pts_price_paise,
       institutional_price_paise = EXCLUDED.institutional_price_paise, max_qty_per_order = EXCLUDED.max_qty_per_order,
       net_quantity = EXCLUDED.net_quantity, manufacturer_name = EXCLUDED.manufacturer_name,
       manufacturer_address = EXCLUDED.manufacturer_address, marketed_by = EXCLUDED.marketed_by,
       telemedicine_list = EXCLUDED.telemedicine_list, updated_at = NOW()
     RETURNING id`,
    [m.name, m.generic, sku, m.category, m.schedule, m.hsn, m.gst, m.description, m.composition, storage,
     paise(m.mrp), offer, Math.round(offer * 0.8), Math.round(offer * 0.72), Math.round(offer * 0.85), maxPerOrder(m),
     m.net, DEMO_MANUFACTURER, DEMO_MANUFACTURER_ADDRESS, m.tele ?? null]))[0];
  const copyChanged = !before || before.description !== m.description || before.composition !== m.composition
    || before.storage_instructions !== storage || before.content_status !== 'approved';
  return { id: row.id, copyChanged, hasImage: !!before?.s3_image_key };
}

// Two batches per medicine, 12–24 months of shelf life (C-27); topped up on re-runs
async function upsertBatches(productId: string, m: DemoMedicine, index: number) {
  const months = [12 + (index % 7), 18 + (index % 7)];
  for (const [i, mo] of months.entries()) {
    const batch = `DEMO-${m.code}-${String.fromCharCode(65 + i)}`;
    const expiry = istDatePlus(Math.round(mo * 30.4));
    const cost = Math.round(paise(m.offer) * 0.6);
    const updated = await query(
      `UPDATE inventory_batches SET quantity_available = GREATEST(quantity_available, quantity_reserved + 150), expiry_date = $3,
         printed_mrp_paise = $4, purchase_price_paise = $5, is_recalled = FALSE
       WHERE product_id = $1 AND batch_number = $2 RETURNING id`, [productId, batch, expiry, paise(m.mrp), cost]);
    if (!updated.length) {
      await query(
        `INSERT INTO inventory_batches (product_id, batch_number, quantity_available, purchase_price_paise, expiry_date,
           manufactured_date, printed_mrp_paise, storage_location)
         VALUES ($1, $2, 200, $3, $4, CURRENT_DATE - 30, $5, 'DEMO RACK ${index + 1}')`, [productId, batch, cost, expiry, paise(m.mrp)]);
    }
  }
}

export async function seedCatalogue(adminId: string, pharmacistId: string, opts: { images: boolean }) {
  const images = opts.images && isObjectStoreConfigured();
  let photos = 0, reviewed = 0;
  const ids: Record<string, string> = {};
  for (const [i, m] of DEMO_MEDICINES.entries()) {
    const p = await upsertProduct(m);
    ids[m.code] = p.id;
    if (m.partnerOnly) await query(`UPDATE inventory_batches SET quantity_available = quantity_reserved WHERE product_id = $1`, [p.id]);
    else await upsertBatches(p.id, m, i);
    let needsReview = p.copyChanged;
    if (images && !p.hasImage) {
      const png = packShotPng({ generic: m.generic, name: m.name, net: m.net, category: m.category, form: m.form });
      await setProductImage(p.id, { buffer: png, mimetype: 'image/png', size: png.length }, adminId);   // → pending_review
      photos++; needsReview = true;
    }
    if (needsReview) {
      // The copy is checked for forbidden claims as on any product save, then approved by the pharmacist (C-19)
      const flags = findRestrictedClaims(m.description, m.composition, storageFor(m));
      await query(`UPDATE products SET content_status = 'pending_review', content_flags = $2 WHERE id = $1`,
        [p.id, flags.length ? JSON.stringify(flags) : null]);
      await reviewContent(pharmacistId, p.id, true, 'Trial demo catalogue: generic names, neutral copy, checked for claims (C-19)');
      reviewed++;
    }
    await cacheDel(`product:${p.id}`);
  }
  await cacheDel('categories');
  return { products: DEMO_MEDICINES.length, photos, reviewed, ids, imagesSkipped: opts.images && !images };
}
