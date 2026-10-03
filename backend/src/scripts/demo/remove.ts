// src/scripts/demo/remove.ts — takes the demo data out again (demoSeed --remove):
// demo logins, products (DEMO-…), stock, the partner, slots and PIN codes, and puts
// the legal settings back to their empty defaults if they still hold the demo
// placeholders. Statutory records are final (C-34, C-46), so it refuses once demo
// accounts have orders, consultations or prescriptions: a used trial is reset by
// recreating its database instead (deploy/trial/TRIAL.md, "Reset"). Runs in one
// transaction in a maintenance session as role dawabag_maintenance (the only way to delete audit rows).
// Pack photos stay in the trial's object store, which is thrown away with it.
import { withTransaction } from '../../config/database';
import { cacheDel } from '../../config/redis';
import { DEMO_SKU_PREFIX } from './catalogueData';
import { DEMO_MOBILES } from './people';
import { DEMO_PARTNER_LICENCE } from './practice';
import { DEMO_MARK, DEMO_PINCODES, LEGAL_DEFAULTS } from './places';

export async function removeDemoData() {
  const counts = await withTransaction(async (c) => {
    // Sprint 38: the maintenance setting counts only for the dawabag_maintenance role
    // (migration 33); the trial's database login is the owner and may take that role
    try {
      await c.query('SET LOCAL ROLE dawabag_maintenance');
    } catch {
      throw new Error('This login may not act as dawabag_maintenance; run the removal as the database owner (deploy/trial/TRIAL.md)');
    }
    await c.query(`SET LOCAL dawabag.maintenance = 'on'`);
    const q = async (sql: string, params: unknown[] = []) => (await c.query(sql, params)).rows;
    const users = (await q('SELECT id FROM users WHERE mobile = ANY($1)', [DEMO_MOBILES])).map((r) => r.id);
    const products = (await q(`SELECT id FROM products WHERE sku LIKE $1`, [`${DEMO_SKU_PREFIX}%`])).map((r) => r.id);
    const vendors = (await q('SELECT id FROM vendors WHERE drug_license_no = $1', [DEMO_PARTNER_LICENCE])).map((r) => r.id);
    const used = (await q(
      `SELECT (SELECT COUNT(*) FROM orders WHERE user_id = ANY($1))
            + (SELECT COUNT(*) FROM order_items WHERE product_id = ANY($2))
            + (SELECT COUNT(*) FROM consultations WHERE patient_user_id = ANY($1)
                 OR doctor_id IN (SELECT id FROM doctor_profiles WHERE user_id = ANY($1)))
            + (SELECT COUNT(*) FROM prescriptions WHERE user_id = ANY($1)) AS n`, [users, products]))[0];
    if (Number(used.n) > 0) {
      throw new Error('Demo accounts or products have orders, consultations or prescriptions (statutory records). '
        + 'Reset the trial by recreating its database instead (deploy/trial/TRIAL.md, "Reset the trial").');
    }
    const doctors = (await q('SELECT id FROM doctor_profiles WHERE user_id = ANY($1)', [users])).map((r) => r.id);
    await q('DELETE FROM doctor_slots WHERE doctor_id = ANY($1)', [doctors]);
    await q('DELETE FROM doctor_profiles WHERE id = ANY($1)', [doctors]);
    await q('DELETE FROM partner_inventory WHERE partner_id = ANY($1) OR partner_product_id IN (SELECT id FROM partner_products WHERE product_id = ANY($2))', [vendors, products]);
    await q('DELETE FROM partner_products WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendors, products]);
    // Stock imports (Sprint 27): the demo partner's go with it (cascade); other partners lose links to demo products
    await q('DELETE FROM partner_item_links WHERE partner_id = ANY($1) OR product_id = ANY($2)', [vendors, products]);
    await q(`UPDATE partner_product_requests SET product_id = NULL, status = 'open', resolved_by = NULL, resolved_at = NULL
             WHERE product_id = ANY($1)`, [products]);
    await q('UPDATE partner_stock_import_rows SET product_id = NULL, match_method = NULL WHERE product_id = ANY($1)', [products]);
    await q('DELETE FROM vendor_users WHERE vendor_id = ANY($1) OR user_id = ANY($2)', [vendors, users]);
    await q('DELETE FROM vendor_performance_history WHERE vendor_id = ANY($1)', [vendors]);
    await q('DELETE FROM vendors WHERE id = ANY($1)', [vendors]);
    // Anyone's cart lines for demo products, then the demo stock and products
    await q('DELETE FROM cart_items WHERE product_id = ANY($1)', [products]);
    await q('DELETE FROM low_stock_alerts WHERE product_id = ANY($1)', [products]);
    // Sprint 40: drills of demo products (trace records) and GDP records go with the demo stock
    await q('DELETE FROM recall_drills WHERE product_id = ANY($1)', [products]);
    await q('DELETE FROM gdp_records WHERE product_id = ANY($1)', [products]);
    await q('DELETE FROM inventory_batches WHERE product_id = ANY($1)', [products]);
    await q(`DELETE FROM audit_logs WHERE new_value->>'product_id' = ANY($1::text[]) OR old_value->>'product_id' = ANY($1::text[])`, [products]);
    await q('DELETE FROM products WHERE id = ANY($1)', [products]);
    // Demo people: anything they touched elsewhere loses the link, their own rows go
    for (const [table, col] of [['audit_logs', 'performed_by'], ['app_settings', 'updated_by'], ['products', 'content_reviewed_by'],
      ['doctor_profiles', 'verified_by'], ['vendors', 'approved_by'], ['partner_products', 'reviewed_by'], ['partner_products', 'posted_by'],
      ['partner_products', 'submitted_by'], ['vendor_users', 'created_by'], ['party_licences', 'verified_by'],
      ['party_licences', 'created_by'], ['business_licences', 'created_by'],
      // Sprint 39
      ['products', 'online_sale_set_by'], ['product_online_status_log', 'set_by'], ['pharmacist_registrations', 'verified_by'],
      ['pharmacist_registrations', 'updated_by'], ['vendor_pharmacists', 'verified_by'], ['partner_batch_provenance', 'recorded_by'],
      // Sprint 40
      ['products', 'new_drug_confirmed_by'], ['gdp_records', 'recorded_by'], ['gdp_records', 'pharmacist_user_id'],
      ['self_inspection_templates', 'created_by'], ['self_inspection_templates', 'updated_by'], ['corrective_action_events', 'changed_by'],
      ['chain_heads', 'recorded_by'],
      // Sprint 41: a job a demo admin ran by hand (Admin → Jobs) kept the admin as its trigger
      ['job_runs', 'triggered_by']] as const) {
      await q(`UPDATE ${table} SET ${col} = NULL WHERE ${col} = ANY($1)`, [users]);
    }
    // Sprint 40: drills a demo admin ran on other products, and self-inspections by demo staff (with their actions)
    await q('DELETE FROM recall_drills WHERE started_by = ANY($1) OR closed_by = ANY($1)', [users]);
    await q('DELETE FROM corrective_actions WHERE owner_user_id = ANY($1) OR created_by = ANY($1) OR closed_by = ANY($1)', [users]);
    await q('DELETE FROM self_inspections WHERE inspected_by = ANY($1)', [users]);
    for (const t of ['cart_items', 'carts', 'notification_deliveries', 'user_devices', 'notifications', 'addresses', 'consent_records',
      'audit_logs', 'pharmacist_registrations', 'user_profiles']) {
      await q(`DELETE FROM ${t} WHERE user_id = ANY($1)`, [users]);
    }
    await q('DELETE FROM users WHERE id = ANY($1)', [users]);
    await q('DELETE FROM pincode_serviceability WHERE pincode = ANY($1)', [DEMO_PINCODES.map((p) => p.pincode)]);
    let settings = 0;
    for (const [key, value] of Object.entries(LEGAL_DEFAULTS)) {
      const r = await q(`UPDATE app_settings SET value = $2, updated_by = NULL, updated_at = NOW() WHERE key = $1 AND value::text LIKE '%DEMO%' RETURNING key`,
        [key, JSON.stringify(value)]);
      settings += r.length;
    }
    await q(`DELETE FROM business_licences WHERE licence_number LIKE $1`, [`${DEMO_MARK}%`]);
    return { users: users.length, products: products.length, partners: vendors.length, settingsReset: settings, mark: DEMO_MARK };
  });
  await cacheDel('categories');
  return counts;
}
