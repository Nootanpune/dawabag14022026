import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dawabag/models/app_notification.dart';
import 'package:dawabag/models/cart_view.dart';
import 'package:dawabag/models/checkout_summary.dart';
import 'package:dawabag/models/order_payment.dart';
import 'package:dawabag/models/payment_result.dart';
import 'package:dawabag/providers/address_provider.dart';
import 'package:dawabag/providers/auth_provider.dart';
import 'package:dawabag/providers/cart_provider.dart';
import 'package:dawabag/providers/sales_status_provider.dart';
import 'package:dawabag/providers/trade_price_provider.dart';
import 'package:dawabag/models/sales_status.dart';
import 'package:dawabag/screens/cart/cart_screen.dart';
import 'package:dawabag/screens/cart/widgets/cart_line_card.dart';
import 'package:dawabag/screens/checkout/checkout_flow.dart';
import 'package:dawabag/screens/checkout/checkout_razorpay.dart';
import 'package:dawabag/screens/checkout/checkout_screen.dart';
import 'package:dawabag/screens/checkout/widgets/confirmed_step.dart';
import 'package:dawabag/screens/checkout/widgets/payment_step.dart';
import 'package:dawabag/screens/checkout/widgets/review_step.dart';
import 'package:dawabag/screens/orders/widgets/cancel_order_button.dart';
import 'package:dawabag/screens/orders/widgets/order_payment_card.dart';
import 'package:dawabag/screens/shop/product_detail_screen.dart';
import 'package:dawabag/services/api_service.dart';
import 'package:dawabag/services/api_utils.dart';
import 'package:dawabag/services/payment_api.dart';
import 'package:dawabag/utils/notification_kinds.dart';
import 'package:dawabag/utils/payment_hold.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

// Sprint 39 (app): prescription before payment, payment held until the
// pharmacist's check (C-08, C-37), products not allowed for online sale (C-10),
// and the new notification types. Made-up names, numbers and references.

DioException _dioError(int status, Map<String, dynamic> body, {String path = '/orders'}) {
  final req = RequestOptions(path: path);
  return DioException(
    requestOptions: req,
    response: Response(requestOptions: req, statusCode: status, data: body),
    type: DioExceptionType.badResponse,
  );
}

const _rxRequiredMsg = "Add your prescription before paying: Testamox 500 needs a doctor's prescription. "
    "Upload it or choose a saved one. You'll only be charged after our pharmacist checks it.";

Map<String, dynamic> _line(String id, String name, {bool rx = false, bool available = true, String? issue}) => {
      'product_id': id,
      'name': name,
      'quantity': 1,
      'unit_price_paise': 5000,
      'mrp_paise': 6000,
      'line_subtotal_paise': 5000,
      'min_qty': 1,
      'max_qty': 10,
      'stock_qty': 50,
      'available': available,
      'issue': issue,
      'requires_prescription': rx,
    };

class _FakeAuth extends StateNotifier<AuthState> implements AuthNotifier {
  _FakeAuth() : super(const AuthState(isAuthenticated: true, user: {'customer_type': 'customer'}));
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FixedCart extends CartNotifier {
  _FixedCart(CartView view) {
    state = CartState(view: view);
  }
  @override
  Future<void> load() async {}
}

/// Answers by "METHOD /path"; records each request body.
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

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child)));

void main() {
  group('API refusals', () {
    test('422 PRESCRIPTION_REQUIRED and 403 NOT_FOR_ONLINE_SALE are recognised', () {
      final rx = _dioError(422, {'success': false, 'message': _rxRequiredMsg, 'code': 'PRESCRIPTION_REQUIRED'});
      expect(isPrescriptionRequired(rx), isTrue);
      expect(apiErrorMessage(rx), _rxRequiredMsg);
      expect(isPrescriptionRequired(_dioError(400, {'code': 'PRESCRIPTION_REQUIRED'})), isFalse);
      final off = _dioError(403, {'message': 'Testcream is not available for online sale right now', 'code': 'NOT_FOR_ONLINE_SALE'});
      expect(isNotForOnlineSale(off), isTrue);
      expect(isNotForOnlineSale(_dioError(403, {'message': 'Forbidden'})), isFalse);
    });

    test('prescription problems on POST /orders send the buyer back to the prescription step', () {
      final rx = _dioError(422, {'message': _rxRequiredMsg, 'code': 'PRESCRIPTION_REQUIRED'});
      expect(isPrescriptionProblem(rx), isTrue);
      expect(prescriptionProblemText(rx, fallback: 'x'), _rxRequiredMsg);
      final expired = _dioError(400, {'message': 'This prescription has expired'});
      expect(isPrescriptionProblem(expired), isTrue);
      expect(prescriptionProblemText(expired, fallback: 'x'), 'This prescription has expired Please choose or upload another one.');
      expect(isPrescriptionProblem(_dioError(409, {'message': 'This prescription is already with another order'})), isTrue);
      expect(isPrescriptionProblem(_dioError(404, {'message': 'Prescription not found'})), isTrue);
      expect(isPrescriptionProblem(_dioError(400, {'message': 'Minimum order is 2'})), isFalse);
      expect(isPrescriptionProblem(_dioError(500, {'message': 'prescription'})), isFalse);
    });
  });

  group('checkout data', () {
    final cart = CartView.fromJson({
      'items': [_line('a', 'Testamox 500', rx: true)],
      'requires_prescription': true,
    });
    const address = {'id': 'addr-1', 'pincode': '411001'};

    test('POST /orders carries prescription_id only when one is chosen', () {
      expect(checkoutOrderBody(cart, address, prescriptionId: 'rx-1')['prescription_id'], 'rx-1');
      expect(checkoutOrderBody(cart, address).containsKey('prescription_id'), isFalse);
    });

    test('preview and placed order read prescription_required and capture', () {
      final s = CheckoutSummary.fromJson(const {'shipments': [], 'prescription_required': true, 'capture': 'after_pharmacist_check'});
      expect(s.prescriptionRequired, isTrue);
      expect(s.chargeAfterCheck, isTrue);
      final plain = CheckoutSummary.fromJson(const {'shipments': []});
      expect(plain.prescriptionRequired, isFalse);
      expect(plain.chargeAfterCheck, isFalse);
      final o = PlacedOrder.fromJson(const {'id': 'o1', 'requires_prescription': true, 'capture': 'after_pharmacist_check'});
      expect(o.chargeAfterCheck, isTrue);
      expect(PlacedOrder.fromJson(const {'id': 'o2'}).chargeAfterCheck, isFalse);
    });

    test('Pay vs Authorise', () {
      expect(payButtonLabel(30000), 'Pay ₹300.00 securely');
      expect(payButtonLabel(30000, chargeAfterCheck: true), 'Authorise ₹300.00 securely');
      expect(CheckoutStep.payment.buttonLabel(totalPaise: 100, orderPlaced: true, chargeAfterCheck: true),
          'Authorise ₹1.00 securely');
    });

    test('verify / demo answers: authorised = held, not charged', () {
      final held = PaymentResult.fromVerify(const {'payment_status': 'authorized', 'charge_note': kChargeAfterCheckNote});
      expect(held.authorised, isTrue);
      expect(held.chargeNote, kChargeAfterCheckNote);
      expect(PaymentResult.fromVerify(const {'payment_status': 'captured'}).authorised, isFalse);
      expect(PaymentResult.fromDemo(const {'paid': true, 'payment_status': 'authorized'}).authorised, isTrue);
      expect(PaymentResult.fromDemo(const {'paid': false}).paid, isFalse);
    });

    test('the Razorpay sheet gets the server order only — nothing about capture', () {
      final o = CheckoutRazorpay.sheetOptions(const {
        'razorpay_key_id': 'rzp_test_x',
        'amount': 30000,
        'razorpay_order_id': 'order_TEST1',
        'capture': 'after_pharmacist_check',
        'charge_note': kChargeAfterCheckNote,
      }, orderNumber: 'DWB-1');
      expect(o['order_id'], 'order_TEST1');
      expect(o['amount'], 30000);
      for (final k in ['payment_capture', 'capture', 'payment', 'capture_options']) {
        expect(o.containsKey(k), isFalse, reason: k);
      }
      expect((o['theme'] as Map)['color'], '#027A86');
    });
  });

  group('checkout screens', () {
    testWidgets('review: the charge waits for the pharmacist check', (tester) async {
      final summary = CheckoutSummary.fromJson(const {'shipments': [], 'capture': 'after_pharmacist_check'});
      await tester.pumpWidget(_wrap(ReviewStep(
        summary: summary, isPractitioner: false, declared: false, onDeclared: (_) {}, orderPlaced: false)));
      expect(find.text(kChargeAfterCheckNote), findsOneWidget);
      final plain = CheckoutSummary.fromJson(const {'shipments': []});
      await tester.pumpWidget(_wrap(ReviewStep(
        summary: plain, isPractitioner: false, declared: false, onDeclared: (_) {}, orderPlaced: false)));
      expect(find.text(kChargeAfterCheckNote), findsNothing);
    });

    testWidgets('payment: the server charge_note and "Amount to authorise"', (tester) async {
      await tester.pumpWidget(_wrap(const PaymentStep(
        orderNumber: 'DWB-1', totalPaise: 30000, options: PaymentOptions(mode: 'razorpay'),
        chargeNote: 'You will only be charged after the check (server words).',
      )));
      expect(find.text('You will only be charged after the check (server words).'), findsOneWidget);
      expect(find.text('Amount to authorise'), findsOneWidget);
    });

    testWidgets('confirmation after an authorised payment: held, not charged', (tester) async {
      await tester.pumpWidget(_wrap(const ConfirmedStep(
        orderNumber: 'DWB-1', authorised: true, totalPaise: 30000, prescriptionLabel: 'photo uploaded 02 Oct 2026, 9:56 am')));
      expect(find.text('Order placed — payment authorised'), findsOneWidget);
      expect(find.text('Amount held: ₹300.00 — not charged yet'), findsOneWidget);
      expect(find.textContaining(kChargeAfterCheckNote), findsOneWidget);
      expect(find.textContaining('you are not charged'), findsOneWidget);

      await tester.pumpWidget(_wrap(const ConfirmedStep(orderNumber: 'DWB-2', totalPaise: 30000)));
      expect(find.text('Order confirmed!'), findsOneWidget);
      expect(find.byKey(const ValueKey('confirmed-amount-held')), findsNothing);
    });

    testWidgets('place order: prescription_id is sent; a 422 goes back to the prescription step', (tester) async {
      tester.view.physicalSize = const Size(1000 * 3, 1800 * 3); // the test font is wide
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final server = _Server({
        'GET /prescriptions/my': [
          (200, {
            'success': true,
            'data': [
              {'id': 'rx-1', 'status': 'pending', 'created_at': '2026-10-02T04:26:00Z', 'file_type': 'jpg'},
            ],
          }),
        ],
        'GET /payments/options': [
          (200, {'success': true, 'data': {'mode': 'razorpay', 'methods': ['upi', 'card']}}),
        ],
        'POST /orders/preview': [
          (200, {
            'success': true,
            'data': {'shipments': [], 'charges': {'total_payable_paise': 30000}, 'prescription_required': true,
              'capture': 'after_pharmacist_check'},
          }),
        ],
        'POST /orders': [
          (422, {'success': false, 'message': _rxRequiredMsg, 'code': 'PRESCRIPTION_REQUIRED'}),
          (201, {
            'success': true,
            'data': {
              'order': {'id': 'o-1', 'order_number': 'DWB-TEST-1', 'total_paise': 30000, 'requires_prescription': true,
                'capture': 'after_pharmacist_check', 'shipments': []},
            },
          }),
        ],
      });
      final saved = apiService.dio.httpClientAdapter;
      apiService.dio.httpClientAdapter = server;
      addTearDown(() => apiService.dio.httpClientAdapter = saved);

      await tester.pumpWidget(ProviderScope(
        overrides: [
          authProvider.overrideWith((ref) => _FakeAuth()),
          cartProvider.overrideWith((ref) => _FixedCart(CartView.fromJson({
                'items': [_line('a', 'Testamox 500', rx: true)],
                'requires_prescription': true,
                'item_count': 1,
              }))),
          addressesProvider.overrideWith((ref) async => [
                {'id': 'addr-1', 'label': 'Home', 'full_name': 'Test Buyer', 'pincode': '411001', 'address_line1': '1 Test Road'},
              ]),
          salesStatusProvider.overrideWith((ref) async => SalesStatus.open),
          tradePricesProvider.overrideWith((ref) async => null),
        ],
        child: const MaterialApp(home: CheckoutScreen()),
      ));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Continue to prescription'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Uploaded — not checked yet'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue to review'));
      await tester.pumpAndSettle();
      expect(find.text(kChargeAfterCheckNote), findsOneWidget);

      await tester.tap(find.text('Place order and pay'));
      await tester.pumpAndSettle();
      expect((server.requests['POST /orders']!.first as Map)['prescription_id'], 'rx-1');
      // Not placed: back on the prescription step with the server's words
      expect(find.text(_rxRequiredMsg), findsOneWidget);
      expect(find.text('Continue to review'), findsOneWidget);

      await tester.tap(find.text('Continue to review'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Place order and pay'));
      await tester.pumpAndSettle();
      expect(server.requests['POST /orders']!.length, 2);
      // Placed with its prescription: no separate use-for-order call; pay = authorise
      expect(server.requests.containsKey('POST /prescriptions/rx-1/use-for-order'), isFalse);
      expect(find.text('Authorise ₹300.00 securely'), findsOneWidget);
      expect(find.text(kChargeAfterCheckNote), findsOneWidget);
    });
  });

  group('order detail payment block', () {
    Map<String, dynamic> order(Map<String, dynamic>? payment) => {'id': 'o1', 'payment': payment};

    test('held, charged after the check, released, ordinary', () {
      final held = OrderPayment.fromOrder(order({
        'status': 'authorized', 'capture': 'after_pharmacist_check', 'authorised_at': '2026-10-03T05:00:00Z',
        'note': kChargeAfterCheckNote,
      }))!.describe()!;
      expect(held.title, "Amount held — you'll be charged after the pharmacist check");
      expect(held.attention, isTrue);

      final charged = OrderPayment.fromOrder(order({
        'status': 'captured', 'capture': 'after_pharmacist_check', 'captured_at': '2026-10-04T06:30:00Z',
      }))!.describe()!;
      expect(charged.title, startsWith('Charged on 04 Oct 2026'));

      final released = OrderPayment.fromOrder(order({
        'status': 'released', 'capture': 'after_pharmacist_check', 'released_at': '2026-10-05T06:30:00Z',
        'note': 'You have not been charged. The amount held is released automatically within 5 days.',
      }))!.describe()!;
      expect(released.title, 'Hold released — you were not charged');
      expect(released.detail, contains('within 5 days'));

      expect(OrderPayment.fromOrder(order({'status': 'captured', 'capture': 'now'}))!.describe(), isNull);
      expect(OrderPayment.fromOrder(order(null)), isNull);
    });

    testWidgets('card shows the plain words; hidden for an ordinary payment', (tester) async {
      final o = order({'status': 'authorized', 'capture': 'after_pharmacist_check'});
      expect(OrderPaymentCard.showsFor(o), isTrue);
      await tester.pumpWidget(_wrap(OrderPaymentCard(order: o)));
      expect(find.text("Amount held — you'll be charged after the pharmacist check"), findsOneWidget);
      expect(find.textContaining(kChargeAfterCheckNote), findsOneWidget);
      expect(OrderPaymentCard.showsFor(order({'status': 'captured', 'capture': 'now'})), isFalse);
    });

    test('cancel: "not charged" when released, "refund" when money was taken', () {
      expect(cancelledMessage(const {'refund_paise': 0, 'released_paise': 30000}),
          'Order cancelled. You have not been charged — the ₹300.00 held is released.');
      expect(cancelledMessage(const {'refund_paise': 30000, 'released_paise': 0}), 'Order cancelled. Refund of ₹300.00 started.');
      expect(cancelledMessage(const {'refund_paise': 0}), 'Order cancelled.');
    });
  });

  group('not for online sale (C-10)', () {
    CartView cart() => CartView.fromJson({
          'items': [
            _line('a', 'Testcream 20 g', available: true, issue: kNotForOnlineSaleIssue),
            _line('b', 'Testcough Syrup'),
          ],
          'subtotal_paise': 5000,
          'item_count': 2,
        });

    test('such a line blocks checkout with a plain message', () {
      final c = cart();
      expect(c.items.first.notForOnlineSale, isTrue);
      expect(c.hasBlockedItems, isTrue);
      expect(c.hasPausedItems, isFalse);
      expect(c.checkoutBlockedMessage,
          'Testcream 20 g is not available for online sale. Please remove Testcream 20 g from your cart to order the rest.');
    });

    testWidgets('the line says why and cannot be raised; checkout waits', (tester) async {
      var raised = false;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: CartLineCard(line: cart().items.first, busy: false, onQuantityChange: (_) => raised = true, onRemove: () {}),
        ),
      ));
      expect(find.textContaining('Not available for online sale'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.add));
      expect(raised, isFalse);

      tester.view.physicalSize = const Size(400 * 3, 2400 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(ProviderScope(
        overrides: [
          authProvider.overrideWith((ref) => _FakeAuth()),
          cartProvider.overrideWith((ref) => _FixedCart(cart())),
          salesStatusProvider.overrideWith((ref) async => SalesStatus.open),
          tradePricesProvider.overrideWith((ref) async => null),
        ],
        child: const MaterialApp(home: CartScreen()),
      ));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('cart-paused-checkout')), findsOneWidget);
      final button = tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'Proceed to checkout'));
      expect(button.onPressed, isNull);
    });

    testWidgets('product page 404: a friendly "not available online" page', (tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: [
          productDetailProvider('gone').overrideWith(
              (ref) async => throw _dioError(404, {'success': false, 'message': 'Product not found'}, path: '/products/gone')),
        ],
        child: const MaterialApp(home: ProductDetailScreen(productId: 'gone')),
      ));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('product-not-online')), findsOneWidget);
      expect(find.text('Not available online'), findsOneWidget);
      expect(find.text('Search medicines'), findsOneWidget);
      expect(find.text('Product not found'), findsNothing);
    });
  });

  group('notifications', () {
    test('new types: order ones open the order; staff ones open nothing', () {
      expect(notificationKind('payment_authorised').title, 'Payment authorised');
      expect(notificationPath('payment_authorised', orderId: 'o-9'), '/orders/o-9');
      for (final t in ['payment_hold_expiring', 'pharmacist_registration_expiring', 'online_sale_status_changed']) {
        expect(kNotificationKinds.containsKey(t), isTrue, reason: t);
        expect(notificationPath(t, orderId: 'o-9'), isNull, reason: t);
      }
    });

    test('order_cancelled with notCharged says so', () {
      final n = AppNotification.fromJson(const {
        'id': 'n1', 'type': 'order_cancelled', 'title': 'Order cancelled', 'body': 'Order DWB-1',
        'data': {'orderId': 'o-1', 'notCharged': true},
      });
      expect(n.notCharged, isTrue);
      expect(n.displayBody, 'Order DWB-1 — you have not been charged');
      final already = AppNotification.fromJson(const {
        'id': 'n2', 'type': 'order_cancelled', 'body': 'Order DWB-1 — you have not been charged', 'data': {'notCharged': true},
      });
      expect(already.displayBody, 'Order DWB-1 — you have not been charged');
      final plain = AppNotification.fromJson(const {'id': 'n3', 'type': 'order_cancelled', 'body': 'Order DWB-1'});
      expect(plain.displayBody, 'Order DWB-1');
    });

    test('every type in the backend templates has a kind (when the backend is checked out)', () {
      final f = File('../backend/src/services/notifications/templates.ts');
      if (!f.existsSync()) return;
      final types = RegExp(r'^    (\w+): \{', multiLine: true).allMatches(f.readAsStringSync()).map((m) => m.group(1)!).toSet();
      expect(types, contains('payment_authorised'));
      for (final t in types) {
        expect(kNotificationKinds.containsKey(t), isTrue, reason: t);
      }
    });
  });
}
