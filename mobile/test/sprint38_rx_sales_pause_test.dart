import 'package:dawabag/models/cart_view.dart';
import 'package:dawabag/models/sales_status.dart';
import 'package:dawabag/providers/auth_provider.dart';
import 'package:dawabag/providers/cart_provider.dart';
import 'package:dawabag/providers/sales_status_provider.dart';
import 'package:dawabag/providers/trade_price_provider.dart';
import 'package:dawabag/screens/auth/register/register_controller.dart';
import 'package:dawabag/screens/auth/register/register_payload.dart';
import 'package:dawabag/screens/auth/register/step_details.dart';
import 'package:dawabag/screens/cart/cart_screen.dart';
import 'package:dawabag/screens/cart/widgets/cart_line_card.dart';
import 'package:dawabag/screens/shop/widgets/product_rx_pause_banner.dart';
import 'package:dawabag/services/api_utils.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

// Sprint 38 — emergency stop for prescription-medicine sales (C-08, C-46) and no
// referral code for doctors / hospitals (C-20). Made-up names and references.

const _msg = 'Orders for prescription medicines are paused for now. You can still order other products. '
    '(Reference: TEST-NOTIF-1)';

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

CartView _pausedCart() => CartView.fromJson({
      'items': [
        _line('a', 'Testamox 500', rx: true, available: false, issue: 'Prescription medicines are paused for now'),
        _line('b', 'Testcough Syrup'),
      ],
      'subtotal_paise': 5000,
      'item_count': 2,
      'rx_sales_paused': _msg,
    });

DioException _dioError(int status, Map<String, dynamic> body) {
  final req = RequestOptions(path: '/orders');
  return DioException(
    requestOptions: req,
    response: Response(requestOptions: req, statusCode: status, data: body),
    type: DioExceptionType.badResponse,
  );
}

/// Signed-in state without the keychain (tests only).
class _FakeAuth extends StateNotifier<AuthState> implements AuthNotifier {
  _FakeAuth(String type) : super(AuthState(isAuthenticated: true, user: {'customer_type': type}));
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

void main() {
  group('GET /sales-status', () {
    test('reads paused and open answers', () {
      final paused = SalesStatus.fromJson(
          {'rx_sales': 'paused', 'message': _msg, 'reference': 'TEST-NOTIF-1', 'since': '2026-10-03T05:00:00Z'});
      expect(paused.rxPaused, isTrue);
      expect(paused.message, _msg);
      expect(paused.reference, 'TEST-NOTIF-1');
      final open = SalesStatus.fromJson({'rx_sales': 'open', 'message': null, 'reference': null, 'since': null});
      expect(open.rxPaused, isFalse);
      expect(open.message, isNull);
      // paused without text still says something plain
      expect(SalesStatus.fromJson({'rx_sales': 'paused'}).message, kDefaultRxPausedMessage);
    });
  });

  group('409 RX_SALES_PAUSED', () {
    test('is recognised and its message shown as is', () {
      final e = _dioError(409, {'success': false, 'message': _msg, 'code': 'RX_SALES_PAUSED'});
      expect(isRxSalesPaused(e), isTrue);
      expect(apiErrorMessage(e), _msg);
      expect(isRxSalesPaused(_dioError(409, {'message': 'Other conflict'})), isFalse);
      expect(isRxSalesPaused(_dioError(400, {'code': 'RX_SALES_PAUSED'})), isFalse);
    });
  });

  group('cart while paused', () {
    test('reads rx_sales_paused and finds the held lines', () {
      final cart = _pausedCart();
      expect(cart.rxSalesPaused, _msg);
      expect(cart.hasPausedItems, isTrue);
      expect(cart.pausedItems.map((l) => l.name), ['Testamox 500']);
      expect(cart.pausedCheckoutMessage, '$_msg Please remove Testamox 500 from your cart to order the rest.');
      final open = CartView.fromJson({
        'items': [_line('a', 'Testamox 500', rx: true)],
        'rx_sales_paused': null,
      });
      expect(open.rxSalesPaused, isNull);
      expect(open.hasPausedItems, isFalse);
    });

    testWidgets('a held line shows the reason and cannot be raised', (tester) async {
      final line = _pausedCart().items.first;
      var raised = false;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: CartLineCard(line: line, busy: false, rxPaused: true, onQuantityChange: (_) => raised = true, onRemove: () {}),
        ),
      ));
      expect(find.text('Prescription medicines are paused for now'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.add));
      expect(raised, isFalse);
    });

    testWidgets('cart shows the banner and blocks checkout until held lines go', (tester) async {
      tester.view.physicalSize = const Size(400 * 3, 2400 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(ProviderScope(
        overrides: [
          authProvider.overrideWith((ref) => _FakeAuth('customer')),
          cartProvider.overrideWith((ref) => _FixedCart(_pausedCart())),
          salesStatusProvider.overrideWith((ref) async => const SalesStatus(rxPaused: true, message: _msg)),
          tradePricesProvider.overrideWith((ref) async => null),
        ],
        child: const MaterialApp(home: CartScreen()),
      ));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('rx-sales-banner')), findsOneWidget);
      expect(find.text(_msg), findsOneWidget);
      expect(find.byKey(const ValueKey('cart-paused-checkout')), findsOneWidget);
      final button = tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'Proceed to checkout'));
      expect(button.onPressed, isNull);
    });
  });

  group('banner on product pages', () {
    Future<void> pump(WidgetTester tester, String schedule, SalesStatus status, {String? type}) async {
      await tester.pumpWidget(ProviderScope(
        overrides: [
          salesStatusProvider.overrideWith((ref) async => status),
          if (type != null) authProvider.overrideWith((ref) => _FakeAuth(type)),
        ],
        child: MaterialApp(home: Scaffold(body: ProductRxPauseBanner(schedule: schedule))),
      ));
      await tester.pumpAndSettle();
    }

    const paused = SalesStatus(rxPaused: true, message: _msg);

    testWidgets('prescription medicine while paused: shown', (tester) async {
      await pump(tester, 'Schedule H', paused, type: 'customer');
      expect(find.text(_msg), findsOneWidget);
    });

    testWidgets('not shown for OTC, when open, or for licensed trade buyers', (tester) async {
      await pump(tester, 'OTC', paused, type: 'customer');
      expect(find.byKey(const ValueKey('rx-sales-banner')), findsNothing);
      await pump(tester, 'Schedule H1', SalesStatus.open, type: 'customer');
      expect(find.byKey(const ValueKey('rx-sales-banner')), findsNothing);
      await pump(tester, 'Schedule H', paused, type: 'doc_hospital');
      expect(find.byKey(const ValueKey('rx-sales-banner')), findsNothing);
    });
  });

  group('sign-up referral code (C-20)', () {
    RegisterController controller(String type) => RegisterController(
          verifyOtp: (_, __) async => <String, dynamic>{},
          onFinished: (_, __) {},
          onMessage: (_, __) {},
        )..customerType = type;

    Future<void> pump(WidgetTester tester, RegisterController c) async {
      await tester.pumpWidget(MaterialApp(home: Scaffold(body: StepDetails(c: c, onMessage: (_, __) {}))));
      await tester.pumpAndSettle();
    }

    testWidgets('hidden for doctors and hospitals, shown for customers', (tester) async {
      final doctor = controller('doc_hospital');
      await pump(tester, doctor);
      expect(find.text('Referral code (optional)'), findsNothing);
      final customer = controller('customer');
      await pump(tester, customer);
      expect(find.text('Referral code (optional)'), findsOneWidget);
    });

    test('a doctor never sends a referral code', () {
      final doctor = controller('doc_hospital')..referralCtrl.text = 'test20';
      expect(doctor.buildPayload().containsKey('referral_code'), isFalse);
      final customer = controller('customer')..referralCtrl.text = 'test20';
      expect(customer.buildPayload()['referral_code'], 'TEST20');
    });
  });
}
