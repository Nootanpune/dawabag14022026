import 'dart:convert';
import 'dart:typed_data';

import 'package:dawabag/models/app_notification.dart';
import 'package:dawabag/providers/notification_inbox_provider.dart';
import 'package:dawabag/screens/notifications/notifications_screen.dart';
import 'package:dawabag/services/api_service.dart';
import 'package:dawabag/services/notification_tap_router.dart';
import 'package:dawabag/utils/notification_kinds.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

// Sprint 36 (app): every notification type the server can send has an icon, a
// title and somewhere to open — order_on_hold included — in push taps and in
// the in-app inbox (GET /notifications/my).

/// Every key of buildMessage() in backend services/notifications/templates.ts.
const kServerTypes = [
  'payment_confirmed', 'rx_pending', 'rx_verified', 'rx_rejected', 'order_on_hold', 'packed', 'dispatched',
  'delivered', 'refill_reminder', 'order_status', 'kyc_approved', 'kyc_rejected', 'licence_expiring',
  'licence_expired', 'credit_due', 'refill_upcoming', 'refill_order_created', 'refill_failed', 'grievance_update',
  'batch_recall', 'order_cancelled', 'return_update', 'data_request_update', 'party_licence_expiring',
  'business_licence_expiring', 'adr_serious', 'security_incident', 'job_failed', 'recall_alert',
  'recall_alert_overdue', 'expiry_watch', 'eprescription_issued', 'out_for_delivery', 'courier_rx_delivered',
  'courier_rto', 'low_stock_digest', 'stock_feed_checks', 'stock_feed_stale',
];

/// Records each call; answers 200.
class _Api implements HttpClientAdapter {
  final calls = <String>[];
  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? s, Future<void>? c) async {
    calls.add('${o.method} ${o.path}');
    return ResponseBody.fromString(jsonEncode({'success': true}), 200, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  group('every server type is handled', () {
    test('each has its own kind (no fallback) and a non-empty title', () {
      for (final t in kServerTypes) {
        expect(kNotificationKinds.containsKey(t), isTrue, reason: t);
        expect(notificationKind(t).title, isNotEmpty, reason: t);
      }
    });

    test('order types with an order id open that order; customer types open their screen', () {
      for (final t in kServerTypes) {
        final kind = notificationKind(t);
        final path = notificationPath(t, orderId: 'o-9');
        if (kind.target == NotificationTarget.staff) {
          expect(path, isNull, reason: t);
        } else {
          expect(path, isNotNull, reason: t);
        }
      }
      expect(notificationPath('order_on_hold', orderId: 'o-9'), '/orders/o-9');
      expect(notificationPath('order_on_hold'), '/orders');
      expect(notificationPath('grievance_update'), '/account/complaints');
      expect(notificationPath('return_update'), '/account/returns');
      expect(notificationPath('refill_failed'), '/account/refills');
      expect(notificationPath('data_request_update'), '/account/privacy');
      expect(notificationPath('licence_expiring'), '/account/licences');
      expect(notificationPath('eprescription_issued'), '/consultations');
    });

    test('order_on_hold is shown as needing attention', () {
      final k = notificationKind('order_on_hold');
      expect(k.icon, Icons.pause_circle_outline);
      expect(k.title, 'Order on hold');
      expect(k.attention, isTrue);
    });

    test('a type this app does not know yet still opens its order, never a blank screen', () {
      expect(notificationKind('brand_new_type'), same(kUnknownNotification));
      expect(notificationPath('brand_new_type', orderId: 'o-1'), '/orders/o-1');
      expect(notificationPath('brand_new_type'), isNull);
    });
  });

  group('push taps', () {
    test('the FCM data payload (type + order_id) maps to a path', () {
      expect(NotificationTapRouter.pathFor({'type': 'order_on_hold', 'order_id': 'abc'}), '/orders/abc');
      expect(NotificationTapRouter.pathFor({'type': 'dispatched', 'order_id': 'abc'}), '/orders/abc');
      expect(NotificationTapRouter.pathFor({'type': 'return_update'}), '/account/returns');
      expect(NotificationTapRouter.pathFor({'type': 'recall_alert'}), isNull);
      expect(NotificationTapRouter.pathFor(const {}), isNull);
    });

    testWidgets('tapping an order_on_hold push opens that order once signed in', (tester) async {
      String? opened;
      final router = GoRouter(routes: [
        GoRoute(path: '/', builder: (c, s) => const Scaffold(body: Text('home'))),
        GoRoute(
            path: '/orders/:id',
            builder: (c, s) {
              opened = s.pathParameters['id'];
              return Scaffold(body: Text('order ${s.pathParameters['id']}'));
            }),
      ]);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      NotificationTapRouter.attach(router);
      NotificationTapRouter.handleData({'type': 'order_on_hold', 'order_id': 'o-77'});
      await tester.pumpAndSettle();
      expect(opened, isNull, reason: 'held until signed in');
      NotificationTapRouter.setSignedIn(true);
      await tester.pumpAndSettle();
      expect(opened, 'o-77');
      // A shown foreground push carries the path as its local payload
      NotificationTapRouter.openLocalPayload('/orders/o-78');
      await tester.pumpAndSettle();
      expect(find.text('order o-78'), findsOneWidget);
      NotificationTapRouter.setSignedIn(false);
    });
  });

  test('inbox rows read the server shape (order id from data.orderId)', () {
    final box = NotificationInbox.fromJson({
      'notifications': [
        {
          'id': 'n1',
          'type': 'order_on_hold',
          'title': 'Order on hold',
          'body': 'Our pharmacist will contact you about order DB-1001.',
          'data': {'type': 'order_on_hold', 'orderId': 'o1', 'orderNumber': 'DB-1001'},
          'is_read': false,
          'sent_at': '2026-10-02T09:45:00Z',
        },
      ],
      'unread_count': '1',
    });
    expect(box.unread, 1);
    expect(box.items.single.orderId, 'o1');
  });

  group('inbox screen', () {
    late _Api api;
    setUp(() {
      api = _Api();
      apiService.dio.httpClientAdapter = api;
    });

    Widget app(NotificationInbox box, void Function(String) onOpen) {
      final router = GoRouter(initialLocation: '/account/notifications', routes: [
        GoRoute(path: '/account/notifications', builder: (c, s) => const NotificationsScreen()),
        GoRoute(
            path: '/orders/:id',
            builder: (c, s) {
              onOpen(s.uri.path);
              return const Scaffold(body: Text('order page'));
            }),
        GoRoute(
            path: '/account/returns',
            builder: (c, s) {
              onOpen(s.uri.path);
              return const Scaffold(body: Text('returns page'));
            }),
      ]);
      return ProviderScope(
        overrides: [notificationInboxProvider.overrideWith((ref) async => box)],
        child: MaterialApp.router(routerConfig: router),
      );
    }

    const hold = AppNotification(
      id: 'n1',
      type: 'order_on_hold',
      title: 'Order on hold',
      body: 'Our pharmacist will contact you about order DB-1001.',
      sentAt: '2026-10-02T09:45:00Z',
      orderId: 'o1',
    );

    testWidgets('order_on_hold: icon, text, unread; a tap marks it read and opens the order', (tester) async {
      String? opened;
      await tester.pumpWidget(app(const NotificationInbox([hold], 1), (p) => opened = p));
      await tester.pumpAndSettle();
      expect(find.text('Order on hold'), findsOneWidget);
      expect(find.text('Our pharmacist will contact you about order DB-1001.'), findsOneWidget);
      expect(find.byIcon(Icons.pause_circle_outline), findsOneWidget);
      expect(find.byKey(const ValueKey('unread-dot')), findsOneWidget);
      expect(find.text('Mark all read'), findsOneWidget);
      await tester.tap(find.text('Order on hold'));
      await tester.pumpAndSettle();
      expect(opened, '/orders/o1');
      expect(api.calls, contains('PATCH /users/me/notifications/n1/read'));
    });

    testWidgets('a row with no title from the server shows its type\'s own title', (tester) async {
      String? opened;
      await tester.pumpWidget(app(
          const NotificationInbox([AppNotification(id: 'n2', type: 'return_update', title: '', body: '', isRead: true)], 0),
          (p) => opened = p));
      await tester.pumpAndSettle();
      expect(find.text('Return update'), findsOneWidget);
      expect(find.text('Mark all read'), findsNothing);
      await tester.tap(find.text('Return update'));
      await tester.pumpAndSettle();
      expect(opened, '/account/returns');
      expect(api.calls, isEmpty, reason: 'already read');
    });

    testWidgets('a staff alert opens nothing in the app and says where to act', (tester) async {
      await tester.pumpWidget(app(
          const NotificationInbox(
              [AppNotification(id: 'n3', type: 'recall_alert', title: 'Recall alert R-1', body: '2 matches', isRead: true)], 0),
          (_) {}));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Recall alert R-1'));
      await tester.pump();
      expect(find.text('Open the Dawabag staff website to act on this.'), findsOneWidget);
    });

    testWidgets('empty inbox', (tester) async {
      await tester.pumpWidget(app(const NotificationInbox([], 0), (_) {}));
      await tester.pumpAndSettle();
      expect(find.text('No notifications yet'), findsOneWidget);
    });
  });
}
