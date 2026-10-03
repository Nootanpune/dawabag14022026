// Every notification type the server can send (backend
// services/notifications/templates.ts), with the icon, a fallback title and
// where a tap goes. Used by push taps and the in-app inbox so no type falls
// through to a blank or unknown handler; a type added on the server later still
// shows its own title and text and opens its order when it names one.

import 'package:flutter/material.dart';

/// Where a notification of a type opens.
enum NotificationTarget {
  /// /orders/:id when the notification names an order, else My orders.
  order,
  refills,
  complaints,
  returns,
  privacy,
  licences,
  account,
  consultations,

  /// Staff-only alerts (recalls, incidents, jobs…): handled on the staff website.
  staff,
}

class NotificationKind {
  final IconData icon;
  final String title;
  final NotificationTarget target;

  /// Shown in amber: something the buyer should look at (a hold, a recall).
  final bool attention;
  const NotificationKind(this.icon, this.title, this.target, {this.attention = false});
}

/// Fallback for a type this app version does not know yet.
const NotificationKind kUnknownNotification =
    NotificationKind(Icons.notifications_outlined, 'Dawabag update', NotificationTarget.order);

const Map<String, NotificationKind> kNotificationKinds = {
  // ── Orders ──
  'payment_confirmed': NotificationKind(Icons.payments_outlined, 'Payment confirmed', NotificationTarget.order),
  'rx_pending': NotificationKind(Icons.description_outlined, 'Prescription pending', NotificationTarget.order),
  'rx_verified': NotificationKind(Icons.task_alt, 'Prescription verified', NotificationTarget.order),
  'rx_rejected': NotificationKind(Icons.report_gmailerrorred_outlined, 'Prescription not accepted', NotificationTarget.order,
      attention: true),
  // Sprint 35/36: the pharmacist put the order on hold and will contact the buyer (C-08)
  'order_on_hold': NotificationKind(Icons.pause_circle_outline, 'Order on hold', NotificationTarget.order, attention: true),
  'packed': NotificationKind(Icons.inventory_2_outlined, 'Order packed', NotificationTarget.order),
  'dispatched': NotificationKind(Icons.local_shipping_outlined, 'Order dispatched', NotificationTarget.order),
  'out_for_delivery': NotificationKind(Icons.delivery_dining_outlined, 'Out for delivery', NotificationTarget.order),
  'delivered': NotificationKind(Icons.check_circle_outline, 'Delivered', NotificationTarget.order),
  'order_status': NotificationKind(Icons.receipt_long_outlined, 'Order update', NotificationTarget.order),
  // may carry notCharged (Sprint 39): an amount only held was released, never taken (C-37)
  'order_cancelled': NotificationKind(Icons.cancel_outlined, 'Order cancelled', NotificationTarget.order),
  // Sprint 39: a prescription order's payment is held until the pharmacist's check (C-08, C-37)
  'payment_authorised': NotificationKind(Icons.verified_user_outlined, 'Payment authorised', NotificationTarget.order),
  'credit_due': NotificationKind(Icons.account_balance_wallet_outlined, 'Payment due', NotificationTarget.order),
  // C-28: a recalled batch the buyer received
  'batch_recall': NotificationKind(Icons.warning_amber_outlined, 'Recall notice', NotificationTarget.order, attention: true),
  // ── Refills ──
  'refill_reminder': NotificationKind(Icons.replay, 'Refill reminder', NotificationTarget.order),
  'refill_upcoming': NotificationKind(Icons.event_repeat_outlined, 'Refill coming up', NotificationTarget.refills),
  'refill_order_created': NotificationKind(Icons.replay, 'Refill order placed', NotificationTarget.order),
  'refill_failed': NotificationKind(Icons.error_outline, 'Refill not placed', NotificationTarget.refills, attention: true),
  // ── Complaints, returns, privacy (C-36, C-37, C-43) ──
  'grievance_update': NotificationKind(Icons.support_agent, 'Complaint update', NotificationTarget.complaints),
  'return_update': NotificationKind(Icons.assignment_return_outlined, 'Return update', NotificationTarget.returns),
  'data_request_update': NotificationKind(Icons.privacy_tip_outlined, 'Privacy request update', NotificationTarget.privacy),
  // ── Accounts and licences (C-07, C-11) ──
  'kyc_approved': NotificationKind(Icons.verified_outlined, 'Account approved', NotificationTarget.account),
  'kyc_rejected': NotificationKind(Icons.gpp_maybe_outlined, 'Verification failed', NotificationTarget.account, attention: true),
  'licence_expiring': NotificationKind(Icons.badge_outlined, 'Drug licence expiring', NotificationTarget.licences,
      attention: true),
  'licence_expired': NotificationKind(Icons.badge_outlined, 'Drug licence expired', NotificationTarget.licences,
      attention: true),
  'business_licence_expiring': NotificationKind(Icons.badge_outlined, 'Licence renewal due', NotificationTarget.licences,
      attention: true),
  'party_licence_expiring': NotificationKind(Icons.badge_outlined, 'Drug licence renewal due', NotificationTarget.staff),
  // ── Teleconsultation ──
  'eprescription_issued': NotificationKind(Icons.medical_information_outlined, 'E-prescription ready',
      NotificationTarget.consultations),
  // ── Staff only (sent to admins / pharmacists) ──
  'adr_serious': NotificationKind(Icons.healing_outlined, 'Serious side-effect report', NotificationTarget.staff),
  'security_incident': NotificationKind(Icons.security_outlined, 'Security incident', NotificationTarget.staff),
  'job_failed': NotificationKind(Icons.sync_problem_outlined, 'Scheduled job failing', NotificationTarget.staff),
  'recall_alert': NotificationKind(Icons.warning_amber_outlined, 'Recall alert', NotificationTarget.staff),
  'recall_alert_overdue': NotificationKind(Icons.warning_amber_outlined, 'Overdue recall alert', NotificationTarget.staff),
  'expiry_watch': NotificationKind(Icons.event_busy_outlined, 'Expiry watch', NotificationTarget.staff),
  'courier_rx_delivered': NotificationKind(Icons.how_to_reg_outlined, 'Confirm prescription handover',
      NotificationTarget.staff),
  'courier_rto': NotificationKind(Icons.keyboard_return, 'Parcel returning (RTO)', NotificationTarget.staff),
  'low_stock_digest': NotificationKind(Icons.inventory_outlined, 'Low stock', NotificationTarget.staff),
  // Sprint 37: partner live stock feed (managed on the website)
  'stock_feed_checks': NotificationKind(Icons.priority_high, 'Stock items to check', NotificationTarget.staff),
  'stock_feed_stale': NotificationKind(Icons.sync_problem_outlined, 'Stock feed stale', NotificationTarget.staff),
  // Sprint 39: staff and partners — handled on the website
  'payment_hold_expiring': NotificationKind(Icons.hourglass_bottom_outlined, 'Prescription order waiting',
      NotificationTarget.staff),
  'pharmacist_registration_expiring': NotificationKind(Icons.badge_outlined, 'Pharmacist registration renewal due',
      NotificationTarget.staff),
  'online_sale_status_changed': NotificationKind(Icons.storefront_outlined, 'Product switched off for online sale',
      NotificationTarget.staff),
};

NotificationKind notificationKind(String? type) => kNotificationKinds[type] ?? kUnknownNotification;

/// The app path a notification of [type] opens, or null when it opens nothing
/// in the app (staff alerts are handled on the staff website).
String? notificationPath(String? type, {String? orderId}) {
  final id = orderId?.trim();
  final hasOrder = id != null && id.isNotEmpty;
  switch (notificationKind(type).target) {
    case NotificationTarget.order:
      return hasOrder ? '/orders/${Uri.encodeComponent(id)}' : (kNotificationKinds.containsKey(type) ? '/orders' : null);
    case NotificationTarget.refills:
      return '/account/refills';
    case NotificationTarget.complaints:
      return '/account/complaints';
    case NotificationTarget.returns:
      return '/account/returns';
    case NotificationTarget.privacy:
      return '/account/privacy';
    case NotificationTarget.licences:
      return '/account/licences';
    case NotificationTarget.account:
      return '/account';
    case NotificationTarget.consultations:
      return '/consultations';
    case NotificationTarget.staff:
      return null;
  }
}
