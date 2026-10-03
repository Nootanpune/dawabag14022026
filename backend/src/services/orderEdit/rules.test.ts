import {
  INVOICE_ISSUED_MESSAGE, buyerShare, editBlockReason, editMessage, EditRefused, moneyAction, planEdit, productTotals, refundTiming, repricedDiscount,
} from './rules';

const lines = [
  { order_item_id: 'a', product_id: 'pa', product_name: 'Paracetamol', supply_qty: 3, min_qty: 1 },
  { order_item_id: 'b', product_id: 'pb', product_name: 'Cetirizine', supply_qty: 2, min_qty: 1 },
];

const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as EditRefused).code; } return null; };

describe('order changes before the pharmacist\'s approval (Sprint 44, owner decision 2026-10-03)', () => {
  it('only before the approval and the invoice', () => {
    expect(editBlockReason({ status: 'packing' }, [{ status: 'pending' }, { status: 'cancelled' }])).toBeNull();
    expect(editBlockReason({ status: 'rx_pending' }, [{ status: 'pending', pharmacist_check: 'pending' }])).toBeNull();
    expect(editBlockReason({ status: 'confirmed' }, [{ status: 'pending', pharmacist_check: 'held' }])).toBeNull();
    expect(editBlockReason({ status: 'packing' }, [{ status: 'pending', invoice_number: 'DWB/2627/00001' }])).toBe(INVOICE_ISSUED_MESSAGE);
    expect(editBlockReason({ status: 'packing' }, [{ status: 'pending', pharmacist_check: 'released' }])).toMatch(/already approved/);
    expect(editBlockReason({ status: 'rx_verified' }, [{ status: 'pending' }])).toMatch(/already checked the prescription/);
    expect(editBlockReason({ status: 'rx_pending' }, [{ status: 'pending' }], { rxChecked: true })).toMatch(/already checked/);
    expect(editBlockReason({ status: 'pending_payment' }, [{ status: 'pending' }])).toMatch(/not paid yet/);
    expect(editBlockReason({ status: 'dispatched' }, [{ status: 'dispatched' }])).toMatch(/no longer/);
    expect(editBlockReason({ status: 'rx_rejected' }, [{ status: 'pending' }])).toMatch(/prescription/);
    expect(editBlockReason({ status: 'cancelled' }, [{ status: 'cancelled' }])).toMatch(/cancelled/);
  });

  it('lowers, removes and raises existing lines; adds new medicines; keeps something on the order', () => {
    expect(planEdit(lines, [{ order_item_id: 'a', quantity: 1 }, { order_item_id: 'b', quantity: 0 }]))
      .toEqual([{ order_item_id: 'a', product_id: 'pa', product_name: 'Paracetamol', from_qty: 3, to_qty: 1, kind: 'lowered' },
                { order_item_id: 'b', product_id: 'pb', product_name: 'Cetirizine', from_qty: 2, to_qty: 0, kind: 'removed' }]);
    expect(planEdit(lines, [{ order_item_id: 'a', quantity: 5 }])[0]).toMatchObject({ kind: 'raised', from_qty: 3, to_qty: 5 });
    expect(planEdit(lines, [], [{ product_id: 'pc', quantity: 2 }])).toEqual([]);
    expect(code(() => planEdit(lines, [], [{ product_id: 'pa', quantity: 1 }]))).toBe('ORDER_EDIT_ALREADY_ON_ORDER');
    expect(code(() => planEdit(lines, [], [{ product_id: 'pc', quantity: 1 }, { product_id: 'pc', quantity: 2 }]))).toBe('ORDER_EDIT_DUPLICATE');
    expect(code(() => planEdit(lines, [], [{ product_id: 'pc', quantity: 0 }]))).toBe('ORDER_EDIT_BAD_QUANTITY');
    expect(code(() => planEdit(lines, [{ order_item_id: 'a', quantity: 0 }, { order_item_id: 'b', quantity: 0 }]))).toBe('ORDER_EDIT_WOULD_EMPTY');
    // removing everything but adding something is a change, not an empty order
    expect(planEdit(lines, [{ order_item_id: 'a', quantity: 0 }, { order_item_id: 'b', quantity: 0 }], [{ product_id: 'pc', quantity: 1 }])).toHaveLength(2);
    expect(code(() => planEdit(lines, [{ order_item_id: 'a', quantity: 3 }]))).toBe('ORDER_EDIT_NO_CHANGE');
    expect(code(() => planEdit(lines, [{ order_item_id: 'z', quantity: 0 }]))).toBe('ORDER_EDIT_UNKNOWN_LINE');
    expect(code(() => planEdit(lines, [{ order_item_id: 'a', quantity: 1 }, { order_item_id: 'a', quantity: 2 }]))).toBe('ORDER_EDIT_DUPLICATE');
    expect(code(() => planEdit(lines, [{ order_item_id: 'a', quantity: -1 }]))).toBe('ORDER_EDIT_BAD_QUANTITY');
    expect(code(() => planEdit(lines, []))).toBe('ORDER_EDIT_EMPTY');
  });

  it('trade minimums: keep at least the minimum or remove the line', () => {
    const trade = [{ ...lines[0], supply_qty: 20, min_qty: 10 }, lines[1]];
    expect(code(() => planEdit(trade, [{ order_item_id: 'a', quantity: 5 }]))).toBe('ORDER_EDIT_BELOW_MINIMUM');
    expect(planEdit(trade, [{ order_item_id: 'a', quantity: 10 }])[0].kind).toBe('lowered');
    expect(planEdit(trade, [{ order_item_id: 'a', quantity: 0 }])[0].kind).toBe('removed');
  });

  it('units per product after the change (for the per-order maximum)', () => {
    const t = productTotals([...lines, { order_item_id: 'c', product_id: 'pa', product_name: 'Paracetamol', supply_qty: 2, min_qty: 1 }],
      [{ order_item_id: 'a', product_id: 'pa', product_name: 'Paracetamol', from_qty: 3, to_qty: 4, kind: 'raised' }], [{ product_id: 'pd', quantity: 1 }]);
    expect(t.get('pa')).toBe(6);
    expect(t.get('pb')).toBe(2);
    expect(t.get('pd')).toBe(1);
  });

  it('the coupon discount shrinks in proportion, never grows', () => {
    expect(repricedDiscount(1000, 10000, 5000)).toBe(500);
    expect(repricedDiscount(1000, 10000, 15000)).toBe(1000);
    expect(repricedDiscount(0, 10000, 5000)).toBe(0);
    expect(repricedDiscount(1000, 10000, 0)).toBe(0);
  });

  it('money: refund now or after the capture, a second payment, or the credit bill', () => {
    expect(moneyAction({ paymentTerms: 'prepaid', heldPayment: false, diff: 0 })).toEqual({ kind: 'none' });
    expect(moneyAction({ paymentTerms: 'prepaid', heldPayment: false, diff: -500 })).toEqual({ kind: 'refund', amount: 500, timing: 'now' });
    expect(moneyAction({ paymentTerms: 'prepaid', heldPayment: true, diff: -500 })).toEqual({ kind: 'refund', amount: 500, timing: 'after_capture' });
    expect(moneyAction({ paymentTerms: 'prepaid', heldPayment: true, diff: 700 })).toEqual({ kind: 'extra', amount: 700 });
    expect(moneyAction({ paymentTerms: 'net_30', heldPayment: false, diff: 700 })).toEqual({ kind: 'credit_bill', delta: 700 });
    expect(moneyAction({ paymentTerms: 'net_30', heldPayment: false, diff: -700 })).toEqual({ kind: 'credit_bill', delta: -700 });
    expect(moneyAction({ paymentTerms: 'net_30', heldPayment: false, diff: -700, creditSettled: true })).toEqual({ kind: 'refund', amount: 700, timing: 'now' });
    expect(editMessage({ kind: 'extra', amount: 700 }, { rxCheck: true, manualCapture: true })).toMatch(/pay the difference of ₹7\.00 \(held now/);
    expect(editMessage({ kind: 'refund', amount: 500, timing: 'now' }, { rxCheck: false })).toMatch(/₹5\.00 is being refunded/);
  });

  it('Sprint 43 helpers kept for changes made after the invoice (before Sprint 44)', () => {
    expect(buyerShare(10000, { subtotal_paise: 38000, gst_paise: 2000, discount_paise: 4000 })).toBe(9000);
    expect(refundTiming({ paymentTerms: 'prepaid', heldPayment: true })).toBe('after_capture');
    expect(refundTiming({ paymentTerms: 'net_30', heldPayment: false })).toBe('now');
  });
});
