// src/jobs/lowStock.job.ts — daily low-stock check + admin email digest
import { query } from '../config/database';
import { checkLowStockAndAlert } from '../services/vendor.service';
import { queueNotification } from '../services/notification.service';

export async function runLowStockJob() {
  const { flagged, newAlerts } = await checkLowStockAndAlert();
  if (newAlerts.length === 0) return { flagged, new_alerts: 0, admins_notified: 0 };

  const rows = newAlerts
    .map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.sku)}</td><td>${p.current_stock}</td><td>${p.reorder_level_qty}</td></tr>`)
    .join('');
  const html = `<p>${newAlerts.length} product(s) reached their reorder level today.</p>
    <table border="1" cellpadding="4" cellspacing="0"><tr><th>Product</th><th>SKU</th><th>Stock</th><th>Reorder level</th></tr>${rows}</table>
    <p>Open Admin → Low stock to raise purchase orders.</p>`;

  const admins = await query<{ id: string }>(
    `SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND is_active = TRUE AND deleted_at IS NULL`
  );
  for (const a of admins) {
    await queueNotification({ userId: a.id, type: 'low_stock_digest', count: newAlerts.length, html });
  }
  return { flagged, new_alerts: newAlerts.length, admins_notified: admins.length };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
