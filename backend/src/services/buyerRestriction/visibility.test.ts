// Sprint 47 guard: every buyer path that sells, adds or offers a product reads who may buy it
// (products.buyer_restriction) through services/buyerRestriction. A new buyer path that
// forgets it fails here. The server is authoritative; the website and app only show it.
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');
const read = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');

describe('who may buy is checked on every buyer path (Sprint 47)', () => {
  it.each([
    // order placement (and refills placed by the job) and lines added before the invoice share this
    ['services/orderLines/pricing.ts', /buyerMay\(prod\.buyer_restriction, buyer\)[\s\S]*BUYER_RESTRICTED/],
    ['services/orderPlacement.service.ts', /priceOrderLine\(client, item, customerType, standing\)/],
    ['services/orderEdit/edit.service.ts', /sellableProduct\(client, id, buyerType, standing\)/],
    ['services/cart.service.ts', /buyerMay\(p\.buyer_restriction, standing\)[\s\S]*BUYER_RESTRICTED/],
    ['services/refill.service.ts', /mayBuySql\('p', standing\)/],
    ['services/search/productSearch.service.ts', /mayBuySql\('p', s\.buyer \?\? NO_STANDING\)\} AS buyer_may_buy/],
    ['services/productDetail.service.ts', /restrictionFields\(row\.buyer_restriction, buyer\)/],
    ['services/shopping/productCards.ts', /restrictionFields\(r\.buyer_restriction, buyer\)/],
    ['services/shopping/buyAgain.service.ts', /mayBuySql\('p', buyer\)/],
    ['services/shopping/cheaperOption.service.ts', /mayBuySql\('p', buyer\)/],
  ])('%s', (file, re) => {
    expect(read(file)).toMatch(re);
  });
  it('the database: default everyone, fixed values, append-only log, change needs who and why', () => {
    const sql = read('../../database/42_sprint47_buyer_restriction.sql');
    expect(sql).toMatch(/buyer_restriction\s+VARCHAR\(20\) NOT NULL DEFAULT 'everyone'/);
    expect(sql).toMatch(/CHECK \(buyer_restriction IN \('everyone', 'practitioners_only', 'trade_only'\)\)/);
    expect(sql).toMatch(/The buyer-restriction log is append-only/);
    expect(sql).toMatch(/changed only by a pharmacist, with a reason/);
  });
  it('only pharmacists may change it through the API', () => {
    expect(read('routes/buyerRestriction.routes.ts')).toMatch(/router\.put\('\/products\/:productId', authorize\('pharmacist_rx'\)/);
  });
});
