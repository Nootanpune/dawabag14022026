import 'dart:convert';
import 'dart:typed_data';

import 'package:dawabag/models/cart_view.dart';
import 'package:dawabag/models/sales_status.dart';
import 'package:dawabag/providers/address_provider.dart';
import 'package:dawabag/providers/auth_provider.dart';
import 'package:dawabag/providers/cart_provider.dart';
import 'package:dawabag/providers/catalog_provider.dart';
import 'package:dawabag/providers/sales_status_provider.dart';
import 'package:dawabag/providers/trade_price_provider.dart';
import 'package:dawabag/providers/typeahead_provider.dart';
import 'package:dawabag/screens/cart/cart_screen.dart';
import 'package:dawabag/screens/cart/widgets/cart_line_card.dart';
import 'package:dawabag/screens/checkout/checkout_screen.dart';
import 'package:dawabag/screens/orders/order_detail_screen.dart';
import 'package:dawabag/screens/orders/widgets/edit/add_medicine_search.dart';
import 'package:dawabag/screens/orders/widgets/refill_order_card.dart';
import 'package:dawabag/screens/search/widgets/search_results_list.dart';
import 'package:dawabag/screens/shop/product_detail_screen.dart';
import 'package:dawabag/services/api_service.dart';
import 'package:dawabag/services/api_utils.dart';
import 'package:dawabag/utils/buyer_restriction.dart';
import 'package:dawabag/widgets/cart_quantity_control.dart';
import 'package:dawabag/widgets/product_card.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

// Sprint 47 (app): who may buy a product — everyone / doctors and hospitals only /
// licensed trade buyers only. The server decides and sends the label and
// buyer_may_buy; the app shows the label and offers no Add to a buyer who may not
// buy it, blocks checkout on such a cart line, and shows the 403 BUYER_RESTRICTED
// and refill refusals in the server's words. Made-up names and numbers.

const _doctorsOnly = 'Supplied only to doctors and hospitals';
const _tradeOnly = 'Supplied only to licensed trade buyers';
const _refusal = 'Testinj 1 vial is supplied only to doctors and hospitals whose medical registration Dawabag has verified.';
const _nothingToRefill = 'Nothing in this order can be refilled';

class _FakeAuth extends StateNotifier<AuthState> implements AuthNotifier {
  _FakeAuth() : super(const AuthState(isAuthenticated: true, user: {'customer_type': 'customer'}));
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

/// A cart held in memory; counts the reloads asked of it.
class _CountingCart extends CartNotifier {
  int loads = 0;
  _CountingCart(CartView view) {
    state = CartState(view: view);
  }
  @override
  Future<void> load() async => loads++;
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

Map<String, dynamic> _ok(Object data) => {'success': true, 'data': data};

Map<String, dynamic> _product(String id, String name, {String? restriction, bool? mayBuy}) => {
      'id': id,
      'name': name,
      'drug_schedule': 'Schedule H',
      'in_stock': true,
      'offer_price_paise': 25000,
      'display_price_paise': 25000,
      'price_paise': 25000,
      'mrp_paise': 30000,
      'min_order_qty': 1,
      'max_order_qty': 10,
      if (restriction != null) 'buyer_restriction': restriction,
      if (restriction != null) 'buyer_restriction_label': switch (restriction) {
        'practitioners_only' => _doctorsOnly,
        'trade_only' => _tradeOnly,
        _ => null,
      },
      if (mayBuy != null) 'buyer_may_buy': mayBuy,
    };

Map<String, dynamic> _line(String id, String name, {String? restriction, String? issue, int qty = 1}) => {
      'product_id': id,
      'name': name,
      'quantity': qty,
      'unit_price_paise': 5000,
      'mrp_paise': 6000,
      'line_subtotal_paise': 5000 * qty,
      'min_qty': 1,
      'max_qty': 10,
      'stock_qty': 50,
      'available': issue == null,
      'issue': issue,
      'requires_prescription': false,
      if (restriction != null) 'buyer_restriction': restriction,
      if (restriction != null) 'buyer_restriction_label': restriction == 'practitioners_only' ? _doctorsOnly : null,
    };

DioException _dioError(int status, Map<String, dynamic> body) {
  final req = RequestOptions(path: '/cart/items/x');
  return DioException(
    requestOptions: req,
    response: Response(requestOptions: req, statusCode: status, data: body),
    type: DioExceptionType.badResponse,
  );
}

void main() {
  group('rules the app reads from the server', () {
    test('label and buyer_may_buy; an older server without the fields: allowed, no label', () {
      final blocked = _product('a', 'Testinj', restriction: 'practitioners_only', mayBuy: false);
      expect(buyerRestrictionLabel(blocked), _doctorsOnly);
      expect(buyerMayNotBuy(blocked), isTrue);
      final allowed = _product('b', 'Testpess', restriction: 'trade_only', mayBuy: true);
      expect(buyerRestrictionLabel(allowed), _tradeOnly);
      expect(buyerMayNotBuy(allowed), isFalse);
      final everyone = _product('c', 'Testamol', restriction: 'everyone', mayBuy: true);
      expect(buyerRestrictionLabel(everyone), isNull);
      final old = _product('d', 'Testold');
      expect(buyerRestrictionLabel(old), isNull);
      expect(buyerMayNotBuy(old), isFalse);
      expect(buyerRestrictionExplanation('practitioners_only'), contains('doctors and hospitals'));
      expect(buyerRestrictionExplanation('everyone'), isNull);
    });

    test('403 BUYER_RESTRICTED is recognised and its message shown as is', () {
      final e = _dioError(403, {'success': false, 'message': _refusal, 'code': 'BUYER_RESTRICTED'});
      expect(isBuyerRestricted(e), isTrue);
      expect(apiErrorMessage(e), _refusal);
      expect(isBuyerRestricted(_dioError(403, {'code': 'NOT_FOR_ONLINE_SALE'})), isFalse);
      expect(isBuyerRestricted(_dioError(400, {'code': 'BUYER_RESTRICTED'})), isFalse);
    });

    test('a cart line the buyer may not buy blocks checkout with a plain message', () {
      final cart = CartView.fromJson({
        'items': [
          _line('a', 'Testinj 1 vial', restriction: 'practitioners_only', issue: _doctorsOnly),
          _line('b', 'Testamol 500', restriction: 'everyone'),
        ],
        'item_count': 2,
      });
      expect(cart.items.first.buyerRestricted, isTrue);
      expect(cart.items.first.buyerRestrictionLabel, _doctorsOnly);
      expect(cart.items.last.buyerRestricted, isFalse);
      expect(cart.items.last.buyerRestrictionLabel, isNull);
      expect(cart.hasBlockedItems, isTrue);
      expect(cart.checkoutBlockedMessage,
          'Testinj 1 vial: supplied only to doctors and hospitals. Please remove Testinj 1 vial from your cart to order the rest.');
      // Older server: no fields, nothing blocked
      final old = CartView.fromJson({
        'items': [_line('b', 'Testamol 500')],
      });
      expect(old.hasBlockedItems, isFalse);
      expect(old.items.single.buyerRestricted, isFalse);
    });
  });

  group('product cards', () {
    testWidgets('search results: label on the card; no Add for a buyer who may not buy it', (tester) async {
      final server = _serve(tester, {
        'GET /products/search': [
          (200, _ok({
            'products': [
              _product('a', 'Testinj 1 vial', restriction: 'practitioners_only', mayBuy: false),
              _product('b', 'Testpess 10 mg', restriction: 'trade_only', mayBuy: true),
              _product('c', 'Testamol 500'),
            ],
            'pagination': {'total': 3},
          })),
        ],
      });
      await tester.pumpWidget(ProviderScope(
        overrides: [
          authProvider.overrideWith((ref) => _FakeAuth()),
          browsePincodeProvider.overrideWith((ref) => ''),
        ],
        child: MaterialApp(home: Scaffold(body: SearchResultsList(query: 'test', onSuggestion: (_) {}))),
      ));
      await tester.pumpAndSettle();
      expect(server.requests.containsKey('GET /products/search'), isTrue);
      expect(find.text(_doctorsOnly), findsOneWidget);
      expect(find.text(_tradeOnly), findsOneWidget);
      // Add only for the two this buyer may buy
      expect(find.text('Add'), findsNWidgets(2));
    });

    testWidgets('grid card: the label in place of Add to cart', (tester) async {
      Widget card(Map<String, dynamic> p) => ProviderScope(
            overrides: [authProvider.overrideWith((ref) => _FakeAuth()), cartProvider.overrideWith((ref) => _CountingCart(CartView.empty))],
            child: MaterialApp(
              home: Scaffold(
                body: SizedBox(
                  width: 180,
                  height: 268,
                  child: ProductCard(product: p, onAddToCart: (_) {}, onTap: () {}, cartControl: CartQuantityControl(product: p)),
                ),
              ),
            ),
          );
      await tester.pumpWidget(card(_product('a', 'Testinj 1 vial', restriction: 'practitioners_only', mayBuy: false)));
      expect(find.byKey(const ValueKey('buyer-restricted')), findsOneWidget);
      expect(find.text(_doctorsOnly), findsOneWidget);
      expect(find.text('Add to cart'), findsNothing);

      await tester.pumpWidget(card(_product('b', 'Testpess 10 mg', restriction: 'trade_only', mayBuy: true)));
      expect(find.byKey(const ValueKey('buyer-restriction-line')), findsOneWidget);
      expect(find.text('Add to cart'), findsOneWidget);

      await tester.pumpWidget(card(_product('c', 'Testamol 500')));
      expect(find.byKey(const ValueKey('buyer-restriction-line')), findsNothing);
      expect(find.byKey(const ValueKey('buyer-restricted')), findsNothing);
      expect(find.text('Add to cart'), findsOneWidget);
    });

    testWidgets('product page: who may buy it, no Add; substitutes carry the label too', (tester) async {
      _serve(tester, {
        'GET /products/p1': [(200, _ok(_product('p1', 'Testinj 1 vial', restriction: 'practitioners_only', mayBuy: false)))],
        'GET /medicines/p1/substitutes': [
          (200, _ok({
            'product': {'id': 'p1', 'name': 'Testinj 1 vial', 'per_unit_paise': 25000, 'unit_label': 'per vial'},
            'total': 1,
            'substitutes': [
              {
                ..._product('s1', 'Otherinj 1 vial', restriction: 'practitioners_only', mayBuy: false),
                'per_unit_paise': 20000, 'unit_label': 'per vial', 'maker': 'Test Maker',
              },
            ],
          })),
        ],
        'GET /cart': [(200, _ok({'items': []}))],
      });
      await tester.pumpWidget(ProviderScope(
        overrides: [
          authProvider.overrideWith((ref) => _FakeAuth()),
          tradePricesProvider.overrideWith((ref) async => null),
        ],
        child: const MaterialApp(home: ProductDetailScreen(productId: 'p1')),
      ));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('buyer-restriction-note')), findsWidgets);
      expect(find.text(buyerRestrictionExplanation('practitioners_only')!), findsOneWidget);
      expect(find.text(kBuyerRestrictedCannotAdd), findsOneWidget);
      final bar = tester.widget<ElevatedButton>(find.byKey(const ValueKey('buy-bar-restricted')));
      expect(bar.onPressed, isNull);
      expect(find.textContaining('Add 1'), findsNothing);
      // The page note, the bottom bar and the substitute row
      expect(find.text(_doctorsOnly), findsNWidgets(3));
    });

    testWidgets('product page from an older server: Add as before', (tester) async {
      _serve(tester, {
        'GET /products/p2': [(200, _ok(_product('p2', 'Testamol 500')))],
        'GET /cart': [(200, _ok({'items': []}))],
      });
      await tester.pumpWidget(ProviderScope(
        overrides: [
          authProvider.overrideWith((ref) => _FakeAuth()),
          tradePricesProvider.overrideWith((ref) async => null),
        ],
        child: const MaterialApp(home: ProductDetailScreen(productId: 'p2')),
      ));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('buyer-restriction-note')), findsNothing);
      expect(find.byKey(const ValueKey('buy-bar-restricted')), findsNothing);
      expect(find.textContaining('Add 1'), findsOneWidget);
    });
  });

  group('cart', () {
    testWidgets('the line shows the label, cannot be raised, and checkout waits', (tester) async {
      final cart = CartView.fromJson({
        'items': [
          _line('a', 'Testinj 1 vial', restriction: 'practitioners_only', issue: _doctorsOnly),
          _line('b', 'Testamol 500', restriction: 'everyone'),
        ],
        'subtotal_paise': 10000,
        'item_count': 2,
      });
      var raised = false;
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: CartLineCard(line: cart.items.first, busy: false, onQuantityChange: (_) => raised = true, onRemove: () {}),
        ),
      ));
      expect(find.textContaining('$_doctorsOnly. Your account cannot buy this product'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.add));
      expect(raised, isFalse);

      tester.view.physicalSize = const Size(400 * 3, 2400 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(ProviderScope(
        overrides: [
          authProvider.overrideWith((ref) => _FakeAuth()),
          cartProvider.overrideWith((ref) => _CountingCart(cart)),
          salesStatusProvider.overrideWith((ref) async => SalesStatus.open),
          tradePricesProvider.overrideWith((ref) async => null),
        ],
        child: const MaterialApp(home: CartScreen()),
      ));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('cart-paused-checkout')), findsOneWidget);
      expect(find.textContaining('Testinj 1 vial: supplied only to doctors and hospitals.'), findsOneWidget);
      final button = tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'Proceed to checkout'));
      expect(button.onPressed, isNull);
    });

    testWidgets('PUT 403 BUYER_RESTRICTED: the server sentence, and the cart is fetched again', (tester) async {
      final server = _serve(tester, {
        'GET /cart': [
          (200, _ok({'items': [_line('a', 'Testinj 1 vial', restriction: 'practitioners_only')], 'item_count': 1})),
          (200, _ok({
            'items': [_line('a', 'Testinj 1 vial', restriction: 'practitioners_only', issue: _doctorsOnly)],
            'item_count': 1,
          })),
        ],
        'PUT /cart/items/a': [(403, {'success': false, 'message': _refusal, 'code': 'BUYER_RESTRICTED'})],
      });
      await tester.pumpWidget(ProviderScope(
        overrides: [
          authProvider.overrideWith((ref) => _FakeAuth()),
          salesStatusProvider.overrideWith((ref) async => SalesStatus.open),
          tradePricesProvider.overrideWith((ref) async => null),
        ],
        child: const MaterialApp(home: CartScreen()),
      ));
      await tester.pumpAndSettle();
      expect(find.text('Proceed to checkout'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.add).first);
      await tester.pumpAndSettle();
      expect(server.requests['PUT /cart/items/a']!.single, {'quantity': 2});
      expect(find.text(_refusal), findsOneWidget);
      expect(server.requests['GET /cart']!.length, 2);
      expect(find.textContaining('Your account cannot buy this product'), findsOneWidget);
      final button = tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'Proceed to checkout'));
      expect(button.onPressed, isNull);
    });
  });

  group('checkout, order changes and refills', () {
    testWidgets('POST /orders/preview 403 BUYER_RESTRICTED: the server sentence, the cart reloaded', (tester) async {
      tester.view.physicalSize = const Size(1000 * 3, 1800 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final server = _Server({
        'POST /orders/preview': [(403, {'success': false, 'message': _refusal, 'code': 'BUYER_RESTRICTED'})],
      });
      final saved = apiService.dio.httpClientAdapter;
      apiService.dio.httpClientAdapter = server;
      addTearDown(() => apiService.dio.httpClientAdapter = saved);
      final cart = _CountingCart(CartView.fromJson({
        'items': [_line('a', 'Testinj 1 vial', restriction: 'practitioners_only')],
        'item_count': 1,
      }));
      await tester.pumpWidget(ProviderScope(
        overrides: [
          authProvider.overrideWith((ref) => _FakeAuth()),
          cartProvider.overrideWith((ref) => cart),
          addressesProvider.overrideWith((ref) async => [
                {'id': 'addr-1', 'label': 'Home', 'full_name': 'Test Buyer', 'pincode': '411001', 'address_line1': '1 Test Road'},
              ]),
          salesStatusProvider.overrideWith((ref) async => SalesStatus.open),
          tradePricesProvider.overrideWith((ref) async => null),
        ],
        child: const MaterialApp(home: CheckoutScreen()),
      ));
      await tester.pumpAndSettle();
      final before = cart.loads;
      await tester.tap(find.text('Review order'));
      await tester.pumpAndSettle();
      expect(server.requests['POST /orders/preview'], hasLength(1));
      expect(find.text(_refusal), findsOneWidget);
      expect(cart.loads, greaterThan(before));
    });

    testWidgets('order change: 403 BUYER_RESTRICTED shown in the sheet, the order reloaded', (tester) async {
      final order = {
        'id': 'o1',
        'order_number': 'DWB-TEST-1',
        'status': 'confirmed',
        'pharmacist_check': 'pending',
        'created_at': '2026-10-03T06:00:00Z',
        'subtotal_paise': 15000,
        'shipping_paise': 0,
        'discount_paise': 0,
        'total_paise': 15000,
        'items': [
          {
            'id': 'a', 'product_id': 'p-a', 'product_name': 'Testinj 1 vial', 'sku': 'SKU-a', 'quantity': 3,
            'removed_qty': 0, 'supply_qty': 3, 'line_total_paise': 15000, 'shipment_id': 's1',
          },
        ],
        'shipments': const [],
        'can_cancel': false,
        'can_edit': true,
        'edits': const [],
        'refunds': const [],
        'credit_notes': const [],
        'returns': const [],
      };
      final server = _serve(tester, {
        'GET /orders/o1': [(200, _ok(order))],
        'POST /orders/o1/edit': [(403, {'success': false, 'message': _refusal, 'code': 'BUYER_RESTRICTED'})],
      });
      await tester.pumpWidget(ProviderScope(
        overrides: [authProvider.overrideWith((ref) => _FakeAuth())],
        child: const MaterialApp(home: OrderDetailScreen(orderId: 'o1')),
      ));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Change order'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithIcon(IconButton, Icons.add).first);
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('edit-save')));
      await tester.pumpAndSettle();
      expect(server.requests['POST /orders/o1/edit'], hasLength(1));
      expect(find.text(_refusal), findsOneWidget);
      expect(server.requests['GET /orders/o1']!.length, greaterThanOrEqualTo(2));
    });

    testWidgets('order change search: no Add for a product this buyer may not buy', (tester) async {
      final added = <String>[];
      await tester.pumpWidget(ProviderScope(
        overrides: [
          typeaheadProvider.overrideWith((ref, key) async => TypeaheadResult(products: [
                _product('a', 'Testinj 1 vial', restriction: 'practitioners_only', mayBuy: false),
                _product('b', 'Testamol 500'),
              ])),
        ],
        child: MaterialApp(
          home: Scaffold(body: SingleChildScrollView(child: AddMedicineSearch(exclude: const {}, onAdd: (p) => added.add('${p['id']}')))),
        ),
      ));
      await tester.enterText(find.byKey(const ValueKey('edit-add-search')), 'test');
      await tester.pump(kTypeaheadDebounce + const Duration(milliseconds: 50));
      await tester.pumpAndSettle();
      expect(find.text(_doctorsOnly), findsOneWidget);
      expect(tester.widget<OutlinedButton>(find.byKey(const ValueKey('edit-add-a'))).onPressed, isNull);
      expect(tester.widget<OutlinedButton>(find.byKey(const ValueKey('edit-add-b'))).onPressed, isNotNull);
    });

    testWidgets('POST /refills 400: "Nothing in this order can be refilled" is shown', (tester) async {
      final server = _serve(tester, {
        'POST /refills': [(400, {'success': false, 'message': _nothingToRefill})],
        'GET /refills': [(200, _ok(<String, dynamic>{}))],
      });
      await tester.pumpWidget(ProviderScope(
        overrides: [authProvider.overrideWith((ref) => _FakeAuth())],
        child: const MaterialApp(home: Scaffold(body: RefillOrderCard(orderId: 'o1'))),
      ));
      await tester.tap(find.text('Refill every…'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('30 days'));
      await tester.pumpAndSettle();
      expect(server.requests['POST /refills']!.single, {'order_id': 'o1', 'frequency_days': 30});
      expect(find.text(_nothingToRefill), findsOneWidget);
      expect(find.text('Refill set up'), findsNothing);
    });
  });
}
