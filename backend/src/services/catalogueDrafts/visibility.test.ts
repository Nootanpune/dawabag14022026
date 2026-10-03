// Sprint 29 guard: a draft product is never visible, searchable, sellable or
// allocatable (C-10, C-19). Two layers are checked here without a database:
//   1. the migration's CHECK refuses an active product that is not 'live', and
//   2. every buyer/partner path that reads the products table filters on is_active
//      (or the shared SELLABLE_SQL / catalogue_state) — so a draft, which can never
//      be active, never reaches a buyer. A new query that forgets the filter fails here.
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');
const read = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');

// Buyer- and partner-facing code that reads products
const CUSTOMER_PATHS = [
  'services/search/productSearch.service.ts', 'services/search/didYouMean.ts', 'services/productDetail.service.ts',
  'services/shopping/productCards.ts', 'services/shopping/cheaperOption.service.ts', 'services/shopping/buyAgain.service.ts',
  'services/cart.service.ts', 'services/orderPlacement.service.ts', 'services/refill.service.ts',
  'services/telemedicine/eprescription.service.ts', 'services/partnerListing.service.ts', 'services/partnerStockImport/evaluate.ts',
  'services/partnerStockImport/import.service.ts', 'controllers/product.controller.ts', 'controllers/partner.controller.ts',
  'routes/coupon.routes.ts', 'services/vendor.service.ts', 'services/checkoutSummary.service.ts', 'services/rxGate.service.ts',
  'services/paymentCapture.service.ts',
];

// Queries that read products without the filter on purpose, and why
const ALLOWED: { file: string; contains: string; why: string }[] = [
  { file: 'services/search/productSearch.service.ts', contains: 'FROM products p ${where}', why: 'where is built from a list that starts with p.is_active = TRUE' },
  { file: 'services/refill.service.ts', contains: 'FROM refill_items ri JOIN products', why: 'prices refill lines; lines are re-checked for is_active when the order is made' },
  { file: 'services/partnerStockImport/import.service.ts', contains: 'FROM partner_stock_import_rows r LEFT JOIN products', why: 'names the product a partner line already matched (only active products match)' },
  { file: 'routes/coupon.routes.ts', contains: 'FROM order_items oi JOIN products', why: 'admin sales report of past orders' },
  { file: 'services/checkoutSummary.service.ts', contains: 'FROM order_items oi JOIN products', why: 'lines of an order already placed' },
  { file: 'services/rxGate.service.ts', contains: 'order_items oi', why: 'lines of an order already placed (and its H1 register)' },
  { file: 'services/paymentCapture.service.ts', contains: 'FROM order_items oi JOIN products', why: 'lines of an order already placed' },
  { file: 'services/partnerListing.service.ts', contains: 'FROM partner_products pp LEFT JOIN products p ON p.id = pp.product_id WHERE pp.id = $1',
    why: 'Sprint 39: reads the schedule / cold chain of a listing the partner already has, to require batch provenance' },
];

describe('draft products stay invisible to buyers (Sprint 29)', () => {
  it('the database refuses an active product that is not live', () => {
    const sql = read('../../database/24_sprint29_catalogue_drafts.sql');
    expect(sql).toMatch(/ADD CONSTRAINT products_active_only_live\s+CHECK \(NOT is_active OR catalogue_state = 'live'\)/);
    expect(sql).toMatch(/products_decided_unless_draft/);
  });

  it('the sellable filter shared by the shop pages requires an active product', () => {
    expect(read('services/shopping/productCards.ts')).toMatch(/SELLABLE_SQL =\s*`p\.is_active = TRUE/);
  });

  it('search builds on is_active', () => {
    expect(read('services/search/productSearch.service.ts')).toMatch(/'p\.is_active = TRUE', 'p\.deleted_at IS NULL'/);
  });

  it.each(CUSTOMER_PATHS)('%s: every products query filters on is_active (or is a known exception)', (file) => {
    const src = read(file);
    const literals = src.match(/`[^`]*`/gs) ?? [];
    const unguarded = literals
      .filter((l) => /\b(FROM|JOIN)\s+products\b/.test(l))
      .filter((l) => !/is_active|SELLABLE_SQL|catalogue_state/.test(l))
      .filter((l) => !ALLOWED.some((a) => a.file === file && l.replace(/\s+/g, ' ').includes(a.contains)));
    expect(unguarded).toEqual([]);
  });

  it('the cart refuses inactive products when adding and shows them as unavailable', () => {
    const cart = read('services/cart.service.ts');
    expect(cart).toMatch(/if \(!p \|\| !p\.is_active \|\| p\.deleted_at\) throw new AppError\('Product not found', 404\)/);
    expect(cart).toMatch(/!p\.is_active \|\| p\.deleted_at .*'No longer available'/);
  });

  it('the old copy queue skips drafts and the copy review refuses them', () => {
    const content = read('services/productContent.service.ts');
    expect(content).toMatch(/catalogue_state NOT IN \('draft', 'rejected'\)/);
    expect(content).toMatch(/catalogue_state === 'draft'\) throw/);
  });
});
