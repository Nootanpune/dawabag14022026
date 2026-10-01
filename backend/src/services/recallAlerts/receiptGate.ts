// Stock may not enter (goods receipt, partner listing, opening stock) in a batch that
// is recalled for that product, or that is on a regulator alert and has not been
// cleared for that product by an admin (C-28).
import { PoolClient } from 'pg';
import { AppError } from '../../utils/AppError';
import { batchKey } from './batchKey';

export async function assertBatchReceivable(client: PoolClient, productId: string, batchNumber: string, productName = 'This product') {
  const recalled = (await client.query(
    `SELECT 1 FROM batch_recalls WHERE product_id = $1 AND batch_number = $2`, [productId, batchNumber])).rows[0];
  if (recalled) throw new AppError(`${productName} batch ${batchNumber} is recalled and cannot be taken into stock`, 409);
  const alert = (await client.query(
    `SELECT a.alert_no, l.id AS line_id, l.drug_name FROM recall_alert_lines l JOIN recall_alerts a ON a.id = l.alert_id
     WHERE l.batch_key = $2 AND NOT EXISTS (
       SELECT 1 FROM recall_alert_matches m WHERE m.line_id = l.id AND m.product_id = $1 AND m.decision = 'cleared')
     ORDER BY a.received_at DESC LIMIT 1`, [productId, batchKey(batchNumber)])).rows[0];
  if (alert) {
    throw new AppError(`${productName} batch ${batchNumber} is on recall alert ${alert.alert_no} ("${alert.drug_name}"). `
      + 'An admin must check it and clear it for this product before it is taken into stock', 409);
  }
}
