// One status label for an order, the same on "My orders" and the order page
// (Sprint 43 QA, same rule as frontend-web/src/lib/orders/statusLabel.ts):
// while the pharmacist is checking the order (C-08), that is what the buyer sees.
import 'package:flutter/material.dart';

import '../config/theme.dart';
import 'pharmacist_check.dart';

class OrderStatusInfo {
  final String label;
  final Color background;
  final Color foreground;
  const OrderStatusInfo(this.label, this.background, this.foreground);
}

/// Order status → label and chip colours (wording as on the website).
const Map<String, OrderStatusInfo> kOrderStatusInfo = {
  'pending_payment': OrderStatusInfo('Awaiting payment', Color(0xFFFAEEDA), Color(0xFF633806)),
  'payment_failed': OrderStatusInfo('Payment failed', Color(0xFFFCEBEB), Color(0xFF791F1F)),
  'rx_pending': OrderStatusInfo('Rx verification pending', Color(0xFFFFF3CD), Color(0xFF633806)),
  'rx_verified': OrderStatusInfo('Prescription verified', Color(0xFFE6F1FB), Color(0xFF0C447C)),
  'packing': OrderStatusInfo('Being prepared', Color(0xFFEEEDFE), Color(0xFF3C3489)),
  'packed': OrderStatusInfo('Packed', Color(0xFFEEEDFE), Color(0xFF3C3489)),
  'dispatched': OrderStatusInfo('Dispatched', Color(0xFFEDFAF4), Color(0xFF0F5235)),
  'delivered': OrderStatusInfo('Delivered', Color(0xFFEDFAF4), Color(0xFF0F5235)),
  'cancelled': OrderStatusInfo('Cancelled', Color(0xFFF1EFE8), Color(0xFF444441)),
  'returned': OrderStatusInfo('Returned', Color(0xFFF1EFE8), Color(0xFF444441)),
};

const OrderStatusInfo _checking = OrderStatusInfo(kCheckStepLabel, AppTheme.brandTeal50, AppTheme.brandTeal700);
const OrderStatusInfo _held = OrderStatusInfo(kHeldChip, AppTheme.amberBadge, AppTheme.amberText);

/// The label for an order from GET /orders/my or GET /orders/:id
/// (`status` and the order-level `pharmacist_check`).
OrderStatusInfo orderStatusInfo(Map order) {
  final status = order['status']?.toString() ?? '';
  final check = order['pharmacist_check']?.toString();
  if (kCheckingStatuses.contains(status)) {
    if (check == CheckState.pending) return _checking;
    if (check == CheckState.held) return _held;
  }
  return kOrderStatusInfo[status] ?? OrderStatusInfo(status.replaceAll('_', ' '), const Color(0xFFF3F4F6), const Color(0xFF4B5563));
}
