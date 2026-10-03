import { buyerShare, editBlockReason, EditRefused, planEdit, refundTiming } from './rules';

const lines = [
  { order_item_id: 'a', product_name: 'Paracetamol', quantity: 3, supply_qty: 3, min_qty: 1 },
  { order_item_id: 'b', product_name: 'Cetirizine', quantity: 2, supply_qty: 2, min_qty: 1 },
];

const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as EditRefused).code; } return null; };

describe('order changes before packing (Sprint 43, URS-074)', () => {
  it('only while every parcel is still waiting to be packed', () => {
    expect(editBlockReason({ status: 'packing' }, [{ status: 'pending' }, { status: 'cancelled' }])).toBeNull();
    expect(editBlockReason({ status: 'rx_pending' }, [{ status: 'pending' }])).toBeNull();
    expect(editBlockReason({ status: 'packing' }, [{ status: 'packed' }, { status: 'pending' }])).toMatch(/Packing has started/);
    expect(editBlockReason({ status: 'pending_payment' }, [{ status: 'pending' }])).toMatch(/not paid yet/);
    expect(editBlockReason({ status: 'dispatched' }, [{ status: 'dispatched' }])).toMatch(/no longer/);
    expect(editBlockReason({ status: 'rx_rejected' }, [{ status: 'pending' }])).toMatch(/prescription/);
    expect(editBlockReason({ status: 'cancelled' }, [{ status: 'cancelled' }])).toMatch(/cancelled/);
  });

  it('lowers and removes; never raises; keeps something on the order', () => {
    expect(planEdit(lines, [{ order_item_id: 'a', quantity: 1 }, { order_item_id: 'b', quantity: 0 }]))
      .toEqual([{ order_item_id: 'a', product_name: 'Paracetamol', from_qty: 3, to_qty: 1, removed: 2 },
                { order_item_id: 'b', product_name: 'Cetirizine', from_qty: 2, to_qty: 0, removed: 2 }]);
    expect(code(() => planEdit(lines, [{ order_item_id: 'a', quantity: 4 }]))).toBe('ORDER_EDIT_INCREASE_NOT_SUPPORTED');
    expect(code(() => planEdit(lines, [{ order_item_id: 'a', quantity: 0 }, { order_item_id: 'b', quantity: 0 }]))).toBe('ORDER_EDIT_WOULD_EMPTY');
    expect(code(() => planEdit(lines, [{ order_item_id: 'a', quantity: 3 }]))).toBe('ORDER_EDIT_NO_CHANGE');
    expect(code(() => planEdit(lines, [{ order_item_id: 'z', quantity: 0 }]))).toBe('ORDER_EDIT_UNKNOWN_LINE');
    expect(code(() => planEdit(lines, [{ order_item_id: 'a', quantity: 1 }, { order_item_id: 'a', quantity: 2 }]))).toBe('ORDER_EDIT_DUPLICATE');
    expect(code(() => planEdit(lines, [{ order_item_id: 'a', quantity: -1 }]))).toBe('ORDER_EDIT_BAD_QUANTITY');
    expect(code(() => planEdit(lines, []))).toBe('ORDER_EDIT_EMPTY');
  });

  it('trade minimums: keep at least the minimum or remove the line', () => {
    const trade = [{ ...lines[0], quantity: 20, supply_qty: 20, min_qty: 10 }, lines[1]];
    expect(code(() => planEdit(trade, [{ order_item_id: 'a', quantity: 5 }]))).toBe('ORDER_EDIT_BELOW_MINIMUM');
    expect(planEdit(trade, [{ order_item_id: 'a', quantity: 10 }])[0].removed).toBe(10);
    expect(planEdit(trade, [{ order_item_id: 'a', quantity: 0 }])[0].removed).toBe(20);
  });

  it('the buyer gets back their share after the order discount', () => {
    expect(buyerShare(10000, { subtotal_paise: 40000, gst_paise: 0, discount_paise: 0 })).toBe(10000);
    expect(buyerShare(10000, { subtotal_paise: 38000, gst_paise: 2000, discount_paise: 4000 })).toBe(9000);
    expect(buyerShare(10000, { subtotal_paise: 0, gst_paise: 0, discount_paise: 0 })).toBe(0);
  });

  it('a held (authorised-only) payment is refunded after its capture; everything else now', () => {
    expect(refundTiming({ paymentTerms: 'prepaid', heldPayment: true })).toBe('after_capture');
    expect(refundTiming({ paymentTerms: 'prepaid', heldPayment: false })).toBe('now');
    expect(refundTiming({ paymentTerms: 'net_30', heldPayment: false })).toBe('now');
  });
});
