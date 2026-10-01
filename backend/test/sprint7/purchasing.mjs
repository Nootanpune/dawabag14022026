// Suppliers, purchase orders, goods receipts, purchase register
import { call, check, q } from '../sprint5/lib.mjs';

const days = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export async function runPurchasing({ t, P }) {
  console.log('Suppliers');
  const supplier = async (name, gst, state) => (await call('POST', '/purchasing/suppliers', { token: t.admin, body: {
    name, drug_license_no: `DL-${name}`, gst_number: gst, state } })).json.data?.id;
  const S = await supplier('S7 Sunrise Distributors', '27ABCDE7777F1Z5', 'Maharashtra');
  const G = await supplier('S7 Gujarat Pharma', '24ABCDE7777F1Z5', 'Gujarat');
  let r = await call('POST', '/purchasing/purchase-orders', { token: t.admin, body: { vendor_id: S, items: [{ product_id: P.a, quantity: 10, unit_cost_paise: 5000 }] } });
  check('no purchase order to an unapproved supplier', r.status === 409, r.json);
  for (const v of [S, G]) {
    r = await call('POST', `/vendors/${v}/approve`, { token: t.admin, body: { drug_license_type: 'dl20b', drug_license_expiry: days(700), vendor_type: 'supplier' } });
  }
  check('suppliers approved with licence validity', r.status === 200, r.json);

  console.log('Purchase orders');
  r = await call('POST', '/purchasing/purchase-orders', { token: t.packer, body: { vendor_id: S, items: [{ product_id: P.a, quantity: 10, unit_cost_paise: 5000 }] } });
  check('storekeeper cannot raise purchase orders', r.status === 403, r.json);
  r = await call('POST', '/purchasing/purchase-orders', { token: t.admin, body: { vendor_id: S, items: [
    { product_id: P.a, quantity: 100, unit_cost_paise: 5000 }, { product_id: P.b, quantity: 50, unit_cost_paise: 3000 }] } });
  const po = r.json.data;
  check('purchase order numbered in the PO series', r.status === 201 && /^PO\/\d{4}\/\d{5}$/.test(po?.po_number || ''), r.json);
  const detail = (await call('GET', `/purchasing/purchase-orders/${po.id}`, { token: t.admin })).json.data;
  const itemA = detail.items.find((i) => i.product_id === P.a), itemB = detail.items.find((i) => i.product_id === P.b);
  check('PO totals include GST', detail.total_amount_paise === 650000 + 78000 && detail.gst_paise === 78000, detail);
  const line = (o) => ({ po_item_id: itemA.id, product_id: P.a, batch_number: 'S7-A-001', expiry_date: days(400), quantity: 60,
    free_quantity: 10, unit_cost_paise: 5000, printed_mrp_paise: 10000, ...o });
  const receive = (body, token = t.packer) => call('POST', '/purchasing/receipts', { token, body: { vendor_id: S, po_id: po.id,
    supplier_invoice_no: 'S7-INV-1', supplier_invoice_date: days(0), ...body } });
  r = await receive({ lines: [line()] });
  check('goods cannot be received on a draft PO', r.status === 409, r.json);
  r = await call('POST', `/purchasing/purchase-orders/${po.id}/approve`, { token: t.admin });
  check('admin approves the PO', r.status === 200 && r.json.data.status === 'sent', r.json);

  console.log('Goods receipt rules');
  r = await receive({ lines: [line({ expiry_date: days(60) }), line({ batch_number: 'S7-A-002', printed_mrp_paise: 8000 }),
    { ...line({ batch_number: 'S7-C-1' }), po_item_id: itemA.id, product_id: P.c }, line({ batch_number: 'S7-A-003', quantity: 150 })] });
  const msg = r.json.message || '';
  check('receipt refused with every line problem listed', r.status === 422 && /shelf life/.test(msg) && /printed MRP/.test(msg)
    && /not on this purchase order/.test(msg) && /more than ordered/.test(msg), msg);
  check('nothing was stored from the refused receipt', (await q(`SELECT COUNT(*)::int AS n FROM goods_receipts WHERE vendor_id = $1`, [S]))[0].n === 0);
  r = await receive({ lines: [line()] });
  const grn1 = r.json.data;
  const batchA = (await q(`SELECT id, quantity_available, purchase_price_paise, printed_mrp_paise FROM inventory_batches WHERE product_id = $1 AND batch_number = 'S7-A-001'`, [P.a]))[0];
  check('receipt numbered in the GRN series', r.status === 201 && /^GRN\/\d{4}\/\d{5}$/.test(grn1?.grn_number || ''), r.json);
  check('batch created with free goods and their lower unit cost', batchA?.quantity_available === 70 && batchA.purchase_price_paise === 4286 && batchA.printed_mrp_paise === 10000, batchA);
  check('PO now partially received', (await call('GET', `/purchasing/purchase-orders/${po.id}`, { token: t.admin })).json.data.status === 'partially_received');
  r = await receive({ lines: [line({ quantity: 1, free_quantity: 0 })] });
  check('the same supplier invoice cannot be received twice', r.status === 409, r.json);
  r = await receive({ supplier_invoice_no: 'S7-INV-2', lines: [line({ quantity: 40, free_quantity: 0 }),
    { po_item_id: itemB.id, product_id: P.b, batch_number: 'S7-B-001', expiry_date: days(500), quantity: 50, unit_cost_paise: 3000, printed_mrp_paise: 10000 }] });
  const a2 = (await q(`SELECT quantity_available FROM inventory_batches WHERE id = $1`, [batchA.id]))[0].quantity_available;
  check('second delivery of the same batch adds to it; PO fully received', r.status === 201 && a2 === 110
    && (await call('GET', `/purchasing/purchase-orders/${po.id}`, { token: t.admin })).json.data.status === 'received', { a2, r: r.json });
  r = await call('POST', '/purchasing/receipts', { token: t.packer, body: { vendor_id: G, supplier_invoice_no: 'GJ-1', supplier_invoice_date: days(0),
    lines: [{ product_id: P.c, batch_number: 'S7-C-1', expiry_date: days(400), quantity: 10, unit_cost_paise: 6000, printed_mrp_paise: 10000 }] } });
  const gj = r.json.data ? (await q(`SELECT cgst_paise, sgst_paise, igst_paise FROM goods_receipts WHERE id = $1`, [r.json.data.id]))[0] : null;
  check('inter-state supplier: IGST, not CGST/SGST', gj && Number(gj.igst_paise) === 7200 && Number(gj.cgst_paise) === 0, gj);
  await q(`UPDATE vendors SET drug_license_expiry = CURRENT_DATE - 1 WHERE id = $1`, [G]);
  r = await call('POST', '/purchasing/receipts', { token: t.packer, body: { vendor_id: G, supplier_invoice_no: 'GJ-2', supplier_invoice_date: days(0),
    lines: [{ product_id: P.c, batch_number: 'S7-C-2', expiry_date: days(400), quantity: 1, unit_cost_paise: 6000, printed_mrp_paise: 10000 }] } });
  check('no receipt from a supplier whose licence has expired', r.status === 409 && /licence/.test(r.json.message), r.json);

  console.log('Purchase register and valuation');
  r = await call('GET', `/accounts/reports/purchase-register?from=${days(-1)}&to=${days(1)}`, { token: t.admin });
  const rows = (r.json.data?.rows || []).filter((x) => x.supplier_name?.startsWith('S7 '));
  check('purchase register lists the three receipts with supplier GSTIN and tax', rows.length === 3 && rows.every((x) => x.supplier_gstin && Number(x.total_paise) > 0), rows);
  r = await call('GET', `/accounts/reports/stock-valuation?from=${days(0)}&to=${days(0)}`, { token: t.admin });
  const val = r.json.data?.rows?.find((x) => x.batch_number === 'S7-A-001');
  // 70 units at ₹42.86 then 40 at ₹50.00 → weighted ₹45.46
  check('stock valuation at weighted cost', val && Number(val.unit_cost_paise) === 4546 && Number(val.value_paise) === 110 * 4546 && val.stock_status === 'sellable', val);
  return { batchA: batchA.id, S };
}
