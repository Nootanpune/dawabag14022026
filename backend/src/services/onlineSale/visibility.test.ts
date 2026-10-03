// Sprint 39 guard: buyers see and buy only products allowed for online sale (C-10).
// Every buyer path that offers or sells a product reads online_sale_status (or the shared
// SELLABLE_SQL / onlineSellableSql). A new buyer query that forgets it fails here.
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../..');
const read = (f: string) => fs.readFileSync(path.join(SRC, f), 'utf8');

describe('only permitted products reach buyers (Sprint 39)', () => {
  it('the shared card filter requires permitted', () => {
    expect(read('services/shopping/productCards.ts')).toMatch(/SELLABLE_SQL =[\s\S]*onlineSellableSql\('p'\)/);
  });
  it.each([
    ['services/search/productSearch.service.ts', /onlineSellableSql\('p'\)/],
    ['services/search/didYouMean.ts', /online_sale_status = 'permitted'/],
    ['services/productDetail.service.ts', /online_sale_status = 'permitted'/],
    ['services/productPage/delivery.service.ts', /online_sale_status = 'permitted'/],
    ['services/refill.service.ts', /online_sale_status = 'permitted'/],
    ['controllers/product.controller.ts', /online_sale_status = 'permitted'/],
    ['services/cart.service.ts', /online_sale_status !== 'permitted'/],
    // Sprint 44: order placement and lines added before the invoice share services/orderLines/pricing.ts
    ['services/orderLines/pricing.ts', /online_sale_status !== 'permitted'/],
    ['services/orderPlacement.service.ts', /priceOrderLine\(/],
    ['services/orderEdit/edit.service.ts', /sellableProduct\(/],
  ])('%s checks the online-sale status', (file, re) => {
    expect(read(file)).toMatch(re);
  });
  it('the database: new products default to restricted, X / NDPS never permitted, log append-only', () => {
    const sql = read('../../database/34_sprint39_rx_capture_online_status_registrations.sql');
    expect(sql).toMatch(/ALTER COLUMN online_sale_status SET DEFAULT 'restricted'/);
    expect(sql).toMatch(/products_x_ndps_never_permitted\s+CHECK \(NOT \(online_sale_status = 'permitted' AND drug_schedule IN \('Schedule X', 'NDPS'\)\)\)/);
    expect(sql).toMatch(/The online-sale status log is append-only/);
  });
});
