import { traceSummary } from './trace';

describe('recall trace summary (Sprint 40, C-28)', () => {
  it('counts orders, buyers, partners, units and stock', () => {
    const s = traceSummary({
      lines: [
        { order_id: 'o1', user_id: 'u1', quantity: 2, shipment_status: 'delivered', seller_type: 'dawabag', partner_id: null },
        { order_id: 'o2', user_id: 'u2', quantity: 1, shipment_status: 'pending', seller_type: 'partner', partner_id: 'v1' },
        { order_id: 'o2', user_id: 'u2', quantity: 3, shipment_status: 'dispatched', seller_type: 'partner', partner_id: 'v1' },
      ],
      h1_entries: [{ id: 'h' }],
      stock: [{ qty_available: 10, partner_id: null }, { qty_available: 0, partner_id: 'v2' }],
      suppliers: [],
    });
    expect(s).toEqual({ orders: 2, buyers: 2, units_supplied: 5, units_awaiting_dispatch: 1, sold_by_dawabag: 1, sold_by_partners: 2,
      partners_involved: 2, h1_entries: 1, stock_on_hand: 10, stock_locations: 1 });
  });
});
