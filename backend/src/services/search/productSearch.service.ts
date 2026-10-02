// Customer catalogue search and browse — GET /api/v1/products/search.
// Rules kept from before Sprint 23: only active, not deleted products; Schedule X
// and NDPS are never listed (C-10); price and quantity limits follow the buyer
// type; stock is the most one seller can supply (own batches or one partner);
// the pack photo only once the pharmacist approved it (C-19, by the caller).
import crypto from 'crypto';
import { pool } from '../../config/database';
import { partnerStockSql } from '../stock/partnerStock';
import { approvedImageKeySql } from '../productImage.service';
import { SearchText, canSearchFuzzy, parseSearchText } from './searchText';
import { buildProductSearchSql } from './productSearchSql';
import { isMissingTrigramError, markTrigramUnavailable, trigramAvailable } from './trigramSupport';

export interface CatalogueSearch {
  q?: string;
  category?: string;
  schedule?: string;
  pricingType: string;
  limit: number;
  offset: number;
  /** relevance (default) or by the buyer's own price; ties keep the relevance order */
  sort?: SearchSort;
}

export const SEARCH_SORTS = ['relevance', 'price_asc', 'price_desc'] as const;
export type SearchSort = typeof SEARCH_SORTS[number];

/** Unknown values fall back to relevance (the default), never an error. */
export function parseSearchSort(v: unknown): SearchSort {
  return (SEARCH_SORTS as readonly string[]).includes(String(v)) ? (v as SearchSort) : 'relevance';
}

/** Where to put the buyer's price in the ORDER BY, before the relevance keys. */
export function sortPrefix(sort: SearchSort | undefined, t: string): string {
  if (sort === 'price_asc') return `${t}.sort_price ASC, `;
  if (sort === 'price_desc') return `${t}.sort_price DESC, `;
  return '';
}

export function buyerColumns(customerType: string) {
  // GAP-01: the price and quantities for the customer's type
  const displayPrice = customerType === 'b2b_retailer'
    ? 'COALESCE(p.ptr_price_paise, p.offer_price_paise)'
    : customerType === 'b2b_wholesaler'
    ? 'COALESCE(p.pts_price_paise, p.offer_price_paise)'
    : customerType === 'doc_hospital'
    ? 'COALESCE(p.institutional_price_paise, p.offer_price_paise)'
    : 'p.offer_price_paise';
  const minQty = customerType === 'b2b_retailer'
    ? 'COALESCE(p.min_order_qty_retailer, 1)'
    : customerType === 'b2b_wholesaler'
    ? 'COALESCE(p.min_order_qty_wholesaler, 10)'
    : '1';
  const maxQty = customerType === 'b2b_retailer'
    ? 'COALESCE(p.max_qty_per_order_retailer, p.max_qty_per_order)'
    : customerType === 'b2b_wholesaler'
    ? 'COALESCE(p.max_qty_per_order_wholesaler, 9999)'
    : 'p.max_qty_per_order';
  return { displayPrice, minQty, maxQty };
}

type Db = { query: (q: string | { name: string; text: string; values: unknown[] }, params?: unknown[]) => Promise<{ rows: any[] }> };

/** Named statement per SQL shape (the shape depends only on the word count, the
 *  filters used and the buyer type, so there are few): Postgres plans it once per
 *  connection instead of on every search, which was half of the search's time. */
const statementName = (sql: string) => `search_${crypto.createHash('sha1').update(sql).digest('hex').slice(0, 20)}`;

async function run(db: Db, s: CatalogueSearch, text: SearchText | null, fuzzy: boolean) {
  // Schedule X and NDPS can never be sold online, so they are not listed (C-10)
  const conditions = [
    'p.is_active = TRUE', 'p.deleted_at IS NULL',
    "COALESCE(p.drug_schedule, '') NOT IN ('Schedule X', 'NDPS')",
  ];
  // Filter parameters first: the count query takes exactly these
  const params: unknown[] = [];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const rankValues: string[] = [];

  if (s.category) conditions.push(`p.category = ${add(s.category)}`);
  if (s.schedule) conditions.push(`p.drug_schedule = ${add(s.schedule)}`);
  let tier = '0';
  let score = '0';
  if (text) {
    // Ranking parameters are numbered after all filter parameters
    const sql = buildProductSearchSql(text, {
      fuzzy,
      whereParam: (v) => `${add(v)}::text`,
      rankParam: (v) => { rankValues.push(v); return `$R${rankValues.length - 1}::text`; },
    });
    conditions.push(sql.where);
    tier = sql.tier;
    score = sql.score;
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const filterParams = [...params];
  const rankBase = params.length + 1;
  const placeRank = (sqlText: string) => sqlText.replace(/\$R(\d+)/g, (_, i) => `$${rankBase + Number(i)}`);
  tier = placeRank(tier);
  score = placeRank(score);
  params.push(...rankValues);

  const { displayPrice, minQty, maxQty } = buyerColumns(s.pricingType);
  // Stock: Dawabag's sellable batches (> 30 days of shelf life, not recalled) or
  // the most one partner can supply from its own ledger (an order line goes to one seller)
  const stockQty = `GREATEST((SELECT COALESCE(SUM(b.quantity_available - b.quantity_reserved), 0) FROM inventory_batches b
       WHERE b.product_id = p.id AND b.expiry_date > CURRENT_DATE + 30 AND b.is_recalled = FALSE), ${partnerStockSql('p.id')})`;
  // Two steps in one statement: (1) rank the matching ids and count them; (2) prices
  // and photo only for the page being shown. A search ranks in-stock first, so step 1
  // works out the stock (an index probe per match); browsing sorts by name only, so
  // the stock is worked out for the page alone.
  const byPrice = s.sort === 'price_asc' || s.sort === 'price_desc';
  const rankCols = (text
    ? `${tier} AS search_tier, ${score} AS search_score, ${stockQty} AS stock_qty`
    : '0 AS search_tier, 0 AS search_score, NULL::bigint AS stock_qty')
    + (byPrice ? `, (${displayPrice}) AS sort_price` : '');
  const rank = (t: string) => sortPrefix(s.sort, t) + (text
    ? `${t}.search_tier, ${t}.search_score DESC, ${t}.stock_qty > 0 DESC, ${t}.name`
    : `${t}.name`);
  const sql =
    `WITH m AS (
       SELECT p.id, p.name, ${rankCols} FROM products p ${where}
     ), pg AS (
       SELECT m.*, COUNT(*) OVER () AS total_count FROM m
       ORDER BY ${rank('m')}
       LIMIT ${add(s.limit)} OFFSET ${add(s.offset)}
     )
     SELECT p.id, p.name, p.generic_name, p.sku, p.category,
            p.drug_schedule, p.telemedicine_list, p.marketed_by, p.mrp_paise,
            p.offer_price_paise, p.cold_chain, p.s3_image_key, p.gst_rate,
            ${approvedImageKeySql()} AS approved_image_key,
            (${displayPrice}) AS display_price_paise,
            (${minQty}) AS min_order_qty,
            (${maxQty}) AS max_order_qty,
            COALESCE(p.reorder_level_qty, 0) AS reorder_level_qty,
            -- the most one seller can supply: Dawabag's batches or one partner's own ledger
            ${text ? 'pg.stock_qty' : stockQty} AS stock_qty,
            pg.total_count
     FROM pg JOIN products p ON p.id = pg.id
     ORDER BY ${rank('pg')}`;
  const { rows } = await db.query({ name: statementName(sql), text: sql, values: params });
  let total = rows.length ? parseInt(rows[0].total_count) : 0;
  if (!rows.length && s.offset > 0) {
    // A page past the end: count separately
    const c = await db.query(`SELECT COUNT(*) FROM products p ${where}`, filterParams);
    total = parseInt(c.rows[0]?.count || '0');
  }
  // The count is internal; the response shape stays as before
  const products = rows.map(({ total_count: _c, ...p }) => p);
  return { products, total };
}

/** A text search runs in a short read-only transaction with its plan pinned to the
 *  indexes and no parallel workers: the planner prices a trigram comparison like a
 *  simple operator, so where a word is common it picks a full (parallel) scan that
 *  evaluates the match on every product (~5× slower in the RUNBOOK 7d test). */
async function pinned<T>(work: (db: Db) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN READ ONLY; SET LOCAL enable_seqscan = off; SET LOCAL max_parallel_workers_per_gather = 0');
    const result = await work(db);
    await db.query('COMMIT');
    return result;
  } catch (err) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    db.release();
  }
}

export async function searchCatalogue(s: CatalogueSearch) {
  const text = parseSearchText(s.q);
  // Something was typed but nothing searchable (only punctuation): no results, not the whole shop
  if (s.q?.trim() && !text) return { products: [], total: 0 };
  if (!text) return run(pool, s, null, false);   // browsing a category
  const fuzzyOk = canSearchFuzzy(text) && (await trigramAvailable());
  try {
    return await pinned(async (db) => {
      // Pass 1: substrings and full text — cheap, and enough for most searches
      // (brand prefixes, generic names, "dolo 65")
      const exact = await run(db, s, text, false);
      if (exact.total > 0 || !fuzzyOk) return exact;
      // Pass 2: nothing found — forgive typos ("paracetmol", "amoxycillin")
      return run(db, s, text, true);
    });
  } catch (err) {
    if (!fuzzyOk || !isMissingTrigramError(err)) throw err;
    markTrigramUnavailable();   // pg_trgm was removed: search on without typo matching
    return pinned((db) => run(db, s, text, false));
  }
}
