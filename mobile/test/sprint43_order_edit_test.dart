import 'dart:convert';
import 'dart:typed_data';

import 'package:dawabag/models/aftercare.dart';
import 'package:dawabag/models/order_edit.dart';
import 'package:dawabag/providers/auth_provider.dart';
import 'package:dawabag/screens/account/health/health_profile_screen.dart';
import 'package:dawabag/screens/orders/order_detail_screen.dart';
import 'package:dawabag/screens/orders/orders_screen.dart';
import 'package:dawabag/services/api_service.dart';
import 'package:dawabag/services/api_utils.dart';
import 'package:dawabag/utils/order_status.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

// Sprint 43 (app): what will be supplied after a change, "Change order" before
// packing (URS-074, credit note C-30/C-31, refund C-37), one status label on the
// list and the order page, refund / credit-note reasons in words, and the health
// data message. Made-up names, numbers and references.

class _FakeAuth extends StateNotifier<AuthState> implements AuthNotifier {
  _FakeAuth() : super(const AuthState(isAuthenticated: true, user: {'customer_type': 'customer'}));
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// A fake API server: answers by "METHOD /path" (one answer each call, the last
/// one repeats) and records each request body.
class _Server implements HttpClientAdapter {
  final Map<String, List<(int, Map<String, dynamic>)>> answers;
  final requests = <String, List<dynamic>>{};
  _Server(this.answers);

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? s, Future<void>? c) async {
    final key = '${o.method} ${o.path}';
    requests.putIfAbsent(key, () => []).add(o.data);
    final queue = answers[key];
    final (status, body) = (queue == null || queue.isEmpty)
        ? (200, <String, dynamic>{'success': true, 'data': <String, dynamic>{}})
        : (queue.length > 1 ? queue.removeAt(0) : queue.first);
    return ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

_Server _serve(WidgetTester tester, Map<String, List<(int, Map<String, dynamic>)>> answers) {
  final server = _Server(answers);
  final saved = apiService.dio.httpClientAdapter;
  apiService.dio.httpClientAdapter = server;
  addTearDown(() => apiService.dio.httpClientAdapter = saved);
  tester.view.physicalSize = const Size(1200, 4000);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  return server;
}

Map<String, dynamic> _item(String id, String name, int qty, {int removed = 0}) => {
      'id': id,
      'product_id': 'p-$id',
      'product_name': name,
      'sku': 'SKU-$id',
      'quantity': qty,
      'removed_qty': removed,
      'supply_qty': qty - removed,
      'line_total_paise': qty * 5000,
      'shipment_id': 's1',
    };

Map<String, dynamic> _order({
  bool canEdit = true,
  String? blockReason,
  List<Map<String, dynamic>>? items,
  List<Map<String, dynamic>> edits = const [],
  List<Map<String, dynamic>> refunds = const [],
  List<Map<String, dynamic>> creditNotes = const [],
}) =>
    {
      'id': 'o1',
      'order_number': 'DWB-TEST-1',
      'status': 'confirmed',
      'pharmacist_check': 'pending',
      'created_at': '2026-10-03T06:00:00Z',
      'subtotal_paise': 25000,
      'shipping_paise': 0,
      'discount_paise': 0,
      'total_paise': 25000,
      'items': items ??
          [
            _item('a', 'Testamol 500', 3),
            _item('b', 'Testirizine 10', 2),
          ],
      'shipments': const [],
      'can_cancel': false,
      'can_edit': canEdit,
      'edit_block_reason': blockReason,
      'edits': edits,
      'refunds': refunds,
      'credit_notes': creditNotes,
      'returns': const [],
    };

Map<String, dynamic> _ok(Map<String, dynamic> data) => {'success': true, 'data': data};

Future<void> _openOrder(WidgetTester tester) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [authProvider.overrideWith((ref) => _FakeAuth())],
    child: const MaterialApp(home: OrderDetailScreen(orderId: 'o1')),
  ));
  await tester.pumpAndSettle();
}

DioException _dioError(int status, Map<String, dynamic> body) {
  final req = RequestOptions(path: '/health-profile');
  return DioException(
    requestOptions: req,
    response: Response(requestOptions: req, statusCode: status, data: body),
    type: DioExceptionType.badResponse,
  );
}

const _unreadable = 'Health details could not be read on this server. Please tell the Dawabag team (health data key).';

void main() {
  group('order lines after a change', () {
    test('supply_qty is shown, with "(was N)" or "(removed by you)"', () {
      expect(orderLineQtyText(_item('a', 'X', 3)), 'Qty: 3');
      expect(orderLineQtyText(_item('a', 'X', 3, removed: 1)), 'Qty: 2 (was 3)');
      expect(orderLineQtyText(_item('a', 'X', 3, removed: 3)), 'Qty: 0 (removed by you)');
      // Older server without supply_qty: the ordered quantity
      expect(supplyQty(const {'quantity': 4}), 4);
    });

    test('only changed lines are sent, 0 removes; removed lines are not offered again', () {
      final order = _order(items: [_item('a', 'A', 3), _item('b', 'B', 2), _item('c', 'C', 1, removed: 1)]);
      final lines = editableLines(order);
      expect(lines.map((l) => l['id']), ['a', 'b']);
      expect(editRequestLines(lines, {'a': 1, 'b': 2}), [
        {'order_item_id': 'a', 'quantity': 1},
      ]);
      expect(editRequestLines(lines, {'a': 3, 'b': 0}), [
        {'order_item_id': 'b', 'quantity': 0},
      ]);
    });

    test('changes and the money back, in the website words', () {
      final edits = OrderEdit.listFrom([
        {
          'id': 'e1',
          'edited_at': '2026-10-03T07:00:00Z',
          'lines': [
            {'order_item_id': 'a', 'product_name': 'Testamol 500', 'from_qty': 3, 'to_qty': 1},
            {'order_item_id': 'b', 'product_name': 'Testirizine 10', 'from_qty': 2, 'to_qty': 0},
          ],
          'refund_paise': 15000,
          'refund_status': 'after_capture',
        },
      ]);
      expect(edits.single.lines.map((l) => l.text), ['Testamol 500: 3 → 1', 'Testirizine 10: removed']);
      expect(edits.single.refundWords, 'refunded as soon as the held payment is taken');
      expect(kEditRefundWords['recorded'], 'refunded the way you paid');
      expect(kEditRefundWords['not_needed'], 'not charged');
    });
  });

  group('labels', () {
    test('one status label for the list and the order page (web statusLabel.ts)', () {
      expect(orderStatusInfo(const {'status': 'confirmed', 'pharmacist_check': 'pending'}).label, 'Pharmacist check');
      expect(orderStatusInfo(const {'status': 'packing', 'pharmacist_check': 'held'}).label, 'On hold — pharmacist will call');
      expect(orderStatusInfo(const {'status': 'packing', 'pharmacist_check': 'released'}).label, 'Being prepared');
      expect(orderStatusInfo(const {'status': 'dispatched', 'pharmacist_check': 'pending'}).label, 'Dispatched');
      expect(orderStatusInfo(const {'status': 'some_new_state'}).label, 'some new state');
    });

    test('refund source and credit-note reason in words', () {
      expect(refundSourceLabel('order_edit'), 'order changed');
      expect(refundSourceLabel('cancellation'), 'order cancelled');
      expect(refundSourceLabel('admin'), 'from Dawabag');
      expect(creditNoteReasonLabel('order_edit'), 'order changed before packing');
      expect(creditNoteReasonLabel('return_damaged'), 'return: damaged');
    });

    test('500 HEALTH_DATA_UNREADABLE shows the server sentence; other 500s stay generic', () {
      expect(apiErrorMessage(_dioError(500, {'message': _unreadable, 'code': kHealthDataUnreadable})), _unreadable);
      expect(apiErrorMessage(_dioError(500, {'message': 'Internal server error'})),
          'Something went wrong on our side. Please try again in a minute.');
    });
  });

  group('order page', () {
    testWidgets('shows supply quantities, the check label and "Changes you made"', (tester) async {
      _serve(tester, {
        'GET /orders/o1': [
          (
            200,
            _ok(_order(
              items: [_item('a', 'Testamol 500', 3, removed: 2), _item('b', 'Testirizine 10', 2, removed: 2)],
              edits: [
                {
                  'id': 'e1',
                  'edited_at': '2026-10-03T07:00:00Z',
                  'lines': [
                    {'order_item_id': 'a', 'product_name': 'Testamol 500', 'from_qty': 3, 'to_qty': 1},
                    {'order_item_id': 'b', 'product_name': 'Testirizine 10', 'from_qty': 2, 'to_qty': 0},
                  ],
                  'refund_paise': 20000,
                  'refund_status': 'after_capture',
                },
              ],
              refunds: [
                {'id': 'r1', 'source': 'order_edit', 'method': 'gateway', 'amount_paise': 20000, 'status': 'pending'},
              ],
              creditNotes: [
                {'id': 'cn1', 'credit_note_number': 'CN-TEST-1', 'total_paise': 20000, 'reason': 'order_edit'},
              ],
            ))
          ),
        ],
      });
      await _openOrder(tester);
      expect(find.text('Pharmacist check'), findsWidgets);
      expect(find.textContaining('Qty: 1', findRichText: true), findsOneWidget);
      expect(find.textContaining('(was 3)', findRichText: true), findsOneWidget);
      expect(find.textContaining('(removed by you)', findRichText: true), findsOneWidget);
      expect(find.text('Changes you made'), findsOneWidget);
      expect(find.text('Testamol 500: 3 → 1'), findsOneWidget);
      expect(find.text('Testirizine 10: removed'), findsOneWidget);
      expect(find.text('₹200.00 refunded as soon as the held payment is taken'), findsOneWidget);
      expect(find.text('Processing · order changed'), findsOneWidget);
      expect(find.text('₹200.00 · order changed before packing'), findsOneWidget);
    });

    testWidgets('not editable: the server reason, no "Change order"', (tester) async {
      const reason = 'Packing has started, so the order can no longer be changed. '
          'You can return items after delivery if they qualify.';
      _serve(tester, {
        'GET /orders/o1': [(200, _ok(_order(canEdit: false, blockReason: reason)))],
      });
      await _openOrder(tester);
      expect(find.text('Change order'), findsNothing);
      expect(find.text(reason), findsOneWidget);
    });

    testWidgets('Change order: lower only, server refusal shown, then saved and reloaded', (tester) async {
      const increase = 'To get more Testamol 500, place a new order — an order can only be lowered once it is placed.';
      final server = _serve(tester, {
        'GET /orders/o1': [
          (200, _ok(_order())),
          (200, _ok(_order())),
          (200, _ok(_order(canEdit: true, items: [_item('a', 'Testamol 500', 3, removed: 2), _item('b', 'Testirizine 10', 2)]))),
        ],
        'POST /orders/o1/edit': [
          (422, {'success': false, 'message': increase, 'code': 'ORDER_EDIT_INCREASE_NOT_SUPPORTED'}),
          (200, _ok({'id': 'e1', 'refund_paise': 10000, 'refund_status': 'recorded',
              'message': 'Your order is changed. ₹100.00 is being refunded the way you paid.'})),
        ],
      });
      await _openOrder(tester);
      await tester.tap(find.text('Change order'));
      await tester.pumpAndSettle();
      expect(find.text('Change this order'), findsOneWidget);

      // Nothing changed yet: Save is off; + is off at the current quantity (no increases)
      final save = find.byKey(const ValueKey('edit-save'));
      expect(tester.widget<ElevatedButton>(save).onPressed, isNull);
      expect(tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.add).first).onPressed, isNull);

      // Removing everything is refused here: cancel instead
      await tester.tap(find.text('Remove').first);
      await tester.pump();
      await tester.tap(find.text('Remove').first);
      await tester.pump();
      expect(find.byKey(const ValueKey('edit-would-empty')), findsOneWidget);
      expect(tester.widget<ElevatedButton>(save).onPressed, isNull);
      await tester.tap(find.text('Keep').last);
      await tester.pump();
      expect(find.text('Ordered 2'), findsOneWidget);

      // Keep Testamol 500 again, then lower it from 3 to 1
      await tester.tap(find.text('Keep'));
      await tester.pump();
      expect(find.text('Ordered 3'), findsOneWidget);
      await tester.tap(find.widgetWithIcon(IconButton, Icons.remove).first);
      await tester.pump();
      await tester.tap(find.widgetWithIcon(IconButton, Icons.remove).first);
      await tester.pump();
      expect(find.text('Was 3'), findsOneWidget);

      await tester.tap(save);
      await tester.pumpAndSettle();
      expect(server.requests['POST /orders/o1/edit']!.first, {
        'lines': [
          {'order_item_id': 'a', 'quantity': 1},
        ],
      });
      expect(find.byKey(const ValueKey('edit-error')), findsOneWidget);
      expect(find.text(increase), findsOneWidget);

      await tester.tap(save);
      await tester.pumpAndSettle();
      expect(find.text('Change this order'), findsNothing);
      expect(find.text('Your order is changed. ₹100.00 is being refunded the way you paid.'), findsOneWidget);
      expect(find.textContaining('(was 3)', findRichText: true), findsOneWidget);
      expect(server.requests['GET /orders/o1']!.length, 3);
    });

    testWidgets('409 ORDER_NOT_EDITABLE: the server sentence', (tester) async {
      const msg = 'Packing has started, so the order can no longer be changed. You can return items after delivery if they qualify.';
      _serve(tester, {
        'GET /orders/o1': [(200, _ok(_order()))],
        'POST /orders/o1/edit': [(409, {'success': false, 'message': msg, 'code': 'ORDER_NOT_EDITABLE'})],
      });
      await _openOrder(tester);
      await tester.tap(find.text('Change order'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Remove').first);
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('edit-save')));
      await tester.pumpAndSettle();
      expect(find.text(msg), findsOneWidget);
    });
  });

  testWidgets('My orders: the same label as the order page and supplied lines only', (tester) async {
    _serve(tester, {
      'GET /orders/my?limit=20': [
        (
          200,
          _ok({
            'orders': [
              {'id': 'o1', 'order_number': 'DWB-TEST-1', 'status': 'confirmed', 'pharmacist_check': 'pending',
                'created_at': '2026-10-03T06:00:00Z', 'total_paise': 25000, 'item_count': '1'},
              {'id': 'o2', 'order_number': 'DWB-TEST-2', 'status': 'packing', 'pharmacist_check': 'released',
                'created_at': '2026-10-02T06:00:00Z', 'total_paise': 5000, 'item_count': 3},
            ],
          })
        ),
      ],
    });
    await tester.pumpWidget(ProviderScope(
      overrides: [authProvider.overrideWith((ref) => _FakeAuth())],
      child: const MaterialApp(home: OrdersScreen()),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Pharmacist check'), findsOneWidget);
    expect(find.text('Being prepared'), findsOneWidget);
    expect(find.text('1 item'), findsOneWidget);
    expect(find.text('3 items'), findsOneWidget);
  });

  testWidgets('health profile: 500 HEALTH_DATA_UNREADABLE shows the server message', (tester) async {
    _serve(tester, {
      'GET /health-profile': [(500, {'success': false, 'message': _unreadable, 'error': _unreadable, 'code': kHealthDataUnreadable})],
    });
    await tester.pumpWidget(const ProviderScope(child: MaterialApp(home: HealthProfileScreen())));
    await tester.pumpAndSettle();
    expect(find.text(_unreadable), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });
}
