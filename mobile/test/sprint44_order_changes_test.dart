import 'dart:convert';
import 'dart:typed_data';

import 'package:dawabag/models/cart_view.dart';
import 'package:dawabag/models/checkout_summary.dart';
import 'package:dawabag/models/order_edit.dart';
import 'package:dawabag/models/payment_result.dart';
import 'package:dawabag/models/practitioner.dart';
import 'package:dawabag/models/sales_status.dart';
import 'package:dawabag/providers/address_provider.dart';
import 'package:dawabag/providers/auth_provider.dart';
import 'package:dawabag/providers/cart_provider.dart';
import 'package:dawabag/providers/sales_status_provider.dart';
import 'package:dawabag/providers/trade_price_provider.dart';
import 'package:dawabag/screens/account/account_screen.dart';
import 'package:dawabag/screens/auth/register/register_controller.dart';
import 'package:dawabag/screens/auth/register/register_payload.dart';
import 'package:dawabag/screens/checkout/checkout_flow.dart';
import 'package:dawabag/screens/checkout/checkout_screen.dart';
import 'package:dawabag/screens/checkout/widgets/rx_choice_card.dart';
import 'package:dawabag/screens/orders/order_detail_screen.dart';
import 'package:dawabag/screens/orders/widgets/edit/edit_rx_picker.dart';
import 'package:dawabag/screens/orders/widgets/shipment_tile.dart';
import 'package:dawabag/services/api_service.dart';
import 'package:dawabag/services/api_utils.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

// Sprint 44 (app): the tax invoice is issued at the pharmacist's approval; the
// order can be changed (lower, remove, raise, add) before it, with a prescription
// for new prescription medicines (C-08) and a second payment for the difference
// (C-37); sales to doctors and institutions need a verified registration and a
// signed written order (Drugs Rules r.65(9)(b)). Made-up names, numbers and
// references throughout.

class _FakeAuth extends StateNotifier<AuthState> implements AuthNotifier {
  _FakeAuth([String type = 'customer'])
      : super(AuthState(isAuthenticated: true, user: {'customer_type': type, 'full_name': 'Test Buyer', 'mobile': '9800000000'}));
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
  tester.view.physicalSize = const Size(1200, 5000);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
  return server;
}

Map<String, dynamic> _ok(Map<String, dynamic> data) => {'success': true, 'data': data};
Map<String, dynamic> _refused(String code, String message) => {'success': false, 'message': message, 'code': code};

Map<String, dynamic> _item(String id, String name, int qty, {String? schedule}) => {
      'id': id,
      'product_id': 'p-$id',
      'product_name': name,
      'quantity': qty,
      'removed_qty': 0,
      'supply_qty': qty,
      'line_total_paise': qty * 5000,
      'drug_schedule': schedule,
      'shipment_id': 's1',
    };

Map<String, dynamic> _order({
  String pricingType = 'customer',
  bool requiresRx = false,
  List<Map<String, dynamic>>? items,
  List<Map<String, dynamic>> edits = const [],
  Map<String, dynamic>? extraPayment,
  List<Map<String, dynamic>> shipments = const [],
  List<Map<String, dynamic>> writtenOrders = const [],
  String? invoiceNote,
  bool canEdit = true,
}) =>
    {
      'id': 'o1',
      'order_number': 'DWB-TEST-44',
      'status': 'confirmed',
      'pharmacist_check': 'pending',
      'pricing_type': pricingType,
      'pincode': '411001',
      'created_at': '2026-10-03T06:00:00Z',
      'subtotal_paise': 20000,
      'shipping_paise': 0,
      'discount_paise': 0,
      'total_paise': 20000,
      'requires_prescription': requiresRx,
      'items': items ?? [_item('a', 'Testamol 500', 3), _item('b', 'Testamox 250', 1, schedule: 'Schedule H')],
      'shipments': shipments,
      'can_cancel': false,
      'can_edit': canEdit,
      'edit_block_reason': null,
      'edits': edits,
      'extra_payment': extraPayment,
      'invoice_note': invoiceNote,
      'written_orders': writtenOrders,
      'refunds': const [],
      'credit_notes': const [],
      'returns': const [],
    };

Future<void> _openOrder(WidgetTester tester, {String type = 'customer'}) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [authProvider.overrideWith((ref) => _FakeAuth(type))],
    child: const MaterialApp(home: OrderDetailScreen(orderId: 'o1')),
  ));
  await tester.pumpAndSettle();
}

Future<void> _tap(WidgetTester tester, Finder f, {bool settle = true}) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  if (settle) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump();
  }
}

DioException _dioError(int status, Map<String, dynamic> body) {
  final req = RequestOptions(path: '/orders');
  return DioException(
    requestOptions: req,
    response: Response(requestOptions: req, statusCode: status, data: body),
    type: DioExceptionType.badResponse,
  );
}

const _invoiceNote = 'The tax invoice is issued when our pharmacist approves the order.';
const _paused = 'Orders are paused: your medical council registration was valid till 2026-09-01. '
    'Upload the renewed registration certificate and Dawabag will verify it.';

Map<String, dynamic> _registration({bool canOrder = true, String status = 'verified', String? message}) => {
      'applies': true,
      'kind': 'doctor',
      'registration_number': 'TMC-2011-0042',
      'council': 'Test Medical Council',
      'name_as_per_register': 'Asha Testkar',
      'status': status,
      'valid_till': canOrder ? '2027-03-31' : '2026-09-01',
      'certificate_uploaded': true,
      'can_order': canOrder,
      'message': message ?? (canOrder ? 'Registration verified, valid till 2027-03-31.' : _paused),
      'written_order_required': true,
    };

void main() {
  group('Sprint 44 data', () {
    test('changes: added lines, the difference to pay and the credit bill, in the website words', () {
      final e = OrderEdit.listFrom([
        {
          'id': 'e1',
          'stage': 'before_invoice',
          'lines': [
            {'order_item_id': 'a', 'product_name': 'Testamol 500', 'from_qty': 3, 'to_qty': 5, 'kind': 'raised'},
            {'order_item_id': null, 'product_name': 'Testirizine 10', 'from_qty': 0, 'to_qty': 2, 'kind': 'added'},
          ],
          'refund_paise': 0,
          'refund_status': 'none',
          'extra_paise': 12000,
          'extra_status': 'awaiting_payment',
          'sent_to_pharmacist': true,
        },
      ]).single;
      expect(e.lines.map((l) => l.text), ['Testamol 500: 3 → 5', 'Testirizine 10: added (2)']);
      expect(e.lines.last.orderItemId, isNull);
      expect(e.extraWords, 'to pay');
      expect(e.sentToPharmacist, isTrue);
      expect(kEditRefundWords['credit_bill'], 'taken off your credit bill');
      expect(kExtraWords['authorised'], 'held until the pharmacist’s check');
      expect(kExtraWords['on_credit_bill'], 'added to your credit bill');
    });

    test('extra_payment is due only while awaiting payment', () {
      expect(ExtraPaymentDue.fromOrder({'extra_payment': {'order_edit_id': 'e1', 'amount_paise': 2500, 'status': 'awaiting_payment'}})!
          .amountPaise, 2500);
      expect(ExtraPaymentDue.fromOrder({'extra_payment': null}), isNull);
      expect(ExtraPaymentDue.fromOrder({'extra_payment': {'order_edit_id': 'e1', 'amount_paise': 2500, 'status': 'paid'}}), isNull);
    });

    test('an invoice exists only once it is issued (number and issue time)', () {
      expect(shipmentInvoiceIssued({'invoice_number': null, 'invoice_issued_at': null}), isFalse);
      expect(shipmentInvoiceIssued({'invoice_number': 'INV-T-1', 'invoice_issued_at': '2026-10-03T08:00:00Z'}), isTrue);
      expect(shipmentInvoiceIssued({'invoice_number': 'INV-T-1', 'invoice_issued_at': null}), isFalse);
      expect(shipmentInvoiceIssued({'invoice_number': 'INV-T-1'}), isTrue); // older server
    });

    test('registration, written orders and the refusals that send the buyer back', () {
      final reg = PractitionerRegistration.fromJson(_registration(canOrder: false));
      expect(reg.headline, 'Medical council registration: Verified, valid till 2026-09-01');
      expect(reg.canOrder, isFalse);
      expect(reg.message, _paused);
      expect(PractitionerRegistration.fromJson(const {'applies': false}).applies, isFalse);
      expect(WrittenOrder.fromJson(const {'id': 'w1', 'kind': 'upload', 'document_name': 'req.pdf'}).title, 'Uploaded requisition (req.pdf)');
      expect(
          WrittenOrder.fromJson(const {
            'id': 'w2',
            'kind': 'in_app',
            'items': [
              {'product_id': 'p1', 'product_name': 'X', 'quantity': 1},
            ],
          }).title,
          'Signed in the app (1 medicine)');
      expect(isWrittenOrderProblem(_dioError(422, _refused('WRITTEN_ORDER_NOT_COVERING', 'x'))), isTrue);
      expect(isWrittenOrderProblem(_dioError(409, _refused('WRITTEN_ORDER_USED', 'x'))), isTrue);
      expect(isWrittenOrderProblem(_dioError(422, _refused('PRESCRIPTION_REQUIRED', 'x'))), isFalse);
      expect(isPractitionerRegistrationInvalid(_dioError(403, _refused('PRACTITIONER_REGISTRATION_INVALID', 'x'))), isTrue);
      expect(PaymentResult.fromVerify(const {'payment_status': 'captured', 'order_edit_id': 'e1'}).orderEditId, 'e1');
      expect(CheckoutSummary.fromJson(const {'written_order_required': true}).writtenOrderRequired, isTrue);
    });

    test('checkout: the written-order step sits between review and payment for doctors', () {
      expect(checkoutBarLabels(false, written: true), ['Address', 'Review', 'Written order', 'Payment']);
      expect(checkoutBarLabels(false), ['Address', 'Review', 'Payment']);
      expect(checkoutNextStep(CheckoutStep.review, hasRx: false, written: true), CheckoutStep.writtenOrder);
      expect(checkoutNextStep(CheckoutStep.writtenOrder, hasRx: false, written: true), CheckoutStep.payment);
      expect(checkoutPreviousStep(CheckoutStep.writtenOrder, hasRx: false, orderPlaced: false), CheckoutStep.review);
      expect(CheckoutStep.writtenOrder.barIndex(false, written: true), 2);
      expect(CheckoutStep.payment.barIndex(false, written: true), 3);
      expect(CheckoutStep.review.buttonLabel(totalPaise: 0, orderPlaced: false, written: true), 'Continue to written order');
      expect(CheckoutStep.writtenOrder.buttonLabel(totalPaise: 0, orderPlaced: false, written: true),
          'Sign or upload the written order');
      expect(CheckoutStep.writtenOrder.buttonLabel(totalPaise: 0, orderPlaced: false, written: true, writtenChosen: true),
          'Place order and pay');
    });

    test('prescriptions offered for a change: the order\'s own (unchecked) and usable saved ones', () {
      final list = editRxChoices([
        {'id': 'own', 'status': 'pending', 'order_id': 'o1'},
        {'id': 'other-order', 'status': 'pending', 'order_id': 'o2'},
        {'id': 'loose', 'status': 'pending', 'order_id': null},
        {'id': 'old', 'status': 'rejected', 'order_id': null},
      ], 'o1');
      expect(list.map((r) => r['id']), ['own', 'loose']);
    });

    test('sign-up: an institution sends practitioner_kind and its name', () {
      final c = RegisterController(verifyOtp: (_, __) async => {}, onFinished: (_, __) {}, onMessage: (_, __) {});
      addTearDown(c.dispose);
      c.selectType('doc_hospital');
      expect(c.practitionerKind, 'doctor');
      expect(c.buildPayload()['practitioner_kind'], 'doctor');
      expect(c.buildPayload().containsKey('business_name'), isFalse);
      c.practitionerKind = 'institution';
      c.businessCtrl.text = ' Sunrise Test Nursing Home ';
      final p = c.buildPayload();
      expect(p['practitioner_kind'], 'institution');
      expect(p['business_name'], 'Sunrise Test Nursing Home');
      expect(kPractitionerKinds.keys, ['doctor', 'institution']);
    });
  });

  group('invoice at the pharmacist\'s approval', () {
    testWidgets('not yet issued: the note, no invoice and no download; issued: number and View invoice', (tester) async {
      _serve(tester, {
        'GET /orders/o1': [
          (
            200,
            _ok(_order(invoiceNote: _invoiceNote, canEdit: false, shipments: [
              {'id': 's1', 'seller_type': 'dawabag', 'status': 'pending', 'invoice_number': null, 'invoice_issued_at': null, 'total_paise': 10000},
              {'id': 's2', 'seller_type': 'partner', 'seller_name': 'Test Partner Pharmacy', 'status': 'packing',
                'invoice_number': 'INV-T-0001', 'invoice_issued_at': '2026-10-03T08:00:00Z', 'total_paise': 10000},
            ]))
          ),
        ],
      });
      await _openOrder(tester);
      expect(find.byKey(const ValueKey('invoice-note')), findsOneWidget);
      expect(find.text(_invoiceNote), findsOneWidget);
      expect(find.text(kInvoiceAfterApproval), findsOneWidget);
      expect(find.text('Tax invoice INV-T-0001'), findsOneWidget);
      expect(find.text('View invoice'), findsOneWidget); // only for the issued one
    });
  });

  group('change order before approval', () {
    testWidgets('raise, add by search with a prescription, refusal shown, saved; then pay the difference', (tester) async {
      const alreadyOn = 'Testamol 500 is already on this order; change its quantity instead.';
      final changed = _order(
        requiresRx: true,
        extraPayment: {'order_edit_id': 'e9', 'amount_paise': 2500, 'status': 'awaiting_payment'},
        edits: [
          {
            'id': 'e9',
            'edited_at': '2026-10-03T07:00:00Z',
            'stage': 'before_invoice',
            'lines': [
              {'order_item_id': 'a', 'product_name': 'Testamol 500', 'from_qty': 3, 'to_qty': 4, 'kind': 'raised'},
              {'order_item_id': null, 'product_name': 'Testirizine 10', 'from_qty': 0, 'to_qty': 1, 'kind': 'added'},
            ],
            'refund_paise': 0,
            'refund_status': 'none',
            'extra_paise': 2500,
            'extra_status': 'awaiting_payment',
            'sent_to_pharmacist': true,
          },
        ],
      );
      final paidOrder = Map<String, dynamic>.from(changed)..['extra_payment'] = null;
      final server = _serve(tester, {
        'GET /orders/o1': [(200, _ok(_order())), (200, _ok(_order())), (200, _ok(changed)), (200, _ok(paidOrder))],
        'GET /products/search': [
          (
            200,
            _ok({
              'products': [
                {'id': 'p-a', 'name': 'Testamol 500', 'display_price_paise': 5000, 'in_stock': true},
                {'id': 'p-new', 'name': 'Testirizine 10', 'drug_schedule': 'Schedule H', 'display_price_paise': 2500, 'in_stock': true},
              ],
              'pagination': {'total': 2},
            })
          ),
        ],
        'GET /prescriptions/my': [
          (
            200,
            {
              'success': true,
              'data': [
                {'id': 'rx-own', 'status': 'pending', 'order_id': 'o1', 'order_number': 'DWB-TEST-44', 'created_at': '2026-10-03T05:00:00Z'},
              ],
            }
          ),
        ],
        'POST /orders/o1/edit': [
          (400, _refused('ORDER_EDIT_ALREADY_ON_ORDER', alreadyOn)),
          (
            200,
            _ok({
              'id': 'e9',
              'extra_paise': 2500,
              'extra_status': 'awaiting_payment',
              'extra_payment': {'order_edit_id': 'e9', 'amount_paise': 2500, 'capture': 'after_pharmacist_check'},
              'order_status': 'rx_pending',
              'sent_to_pharmacist': true,
              'message': 'Your order is changed. Please pay the difference of ₹25.00.',
            })
          ),
        ],
        'GET /payments/options': [
          (200, _ok({'mode': 'demo', 'methods': ['card']})),
        ],
        'POST /payments/demo': [
          (200, _ok({'order_id': 'o1', 'order_edit_id': 'e9', 'paid': true, 'payment_status': 'authorized'})),
        ],
      });
      await _openOrder(tester);
      expect(find.text('Need to change something?'), findsOneWidget);
      await _tap(tester, find.text('Change order'));
      expect(find.text('Change this order'), findsOneWidget);

      // Raise Testamol 500 from 3 to 4 (Sprint 44: allowed before approval)
      await _tap(tester, find.byTooltip('Raise quantity of Testamol 500'), settle: false);
      expect(find.text('Was 3'), findsOneWidget);

      // Add by search: a medicine already on the order is not offered again
      await tester.enterText(find.byKey(const ValueKey('edit-add-search')), 'testi');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('edit-add-p-a')), findsNothing);
      await _tap(tester, find.byKey(const ValueKey('edit-add-p-new')));
      expect(find.textContaining('Added · ₹25.00 each · prescription needed'), findsOneWidget);

      // A prescription medicine added: a prescription is needed before saving (C-08)
      final save = find.byKey(const ValueKey('edit-save'));
      expect(find.text('Prescription needed for Testirizine 10'), findsOneWidget);
      expect(tester.widget<ElevatedButton>(save).onPressed, isNull);
      await _tap(tester, find.byType(RxChoiceCard).first);
      expect(tester.widget<ElevatedButton>(save).onPressed, isNotNull);

      await _tap(tester, save);
      expect(find.byKey(const ValueKey('edit-error')), findsOneWidget);
      expect(find.text(alreadyOn), findsOneWidget);

      await _tap(tester, save);
      expect(server.requests['POST /orders/o1/edit']!.last, {
        'lines': [
          {'order_item_id': 'a', 'quantity': 4},
        ],
        'add': [
          {'product_id': 'p-new', 'quantity': 1},
        ],
        'prescription_id': 'rx-own',
      });
      expect(find.text('Change this order'), findsNothing);
      expect(find.text('Your order is changed. Please pay the difference of ₹25.00.'), findsOneWidget);

      // Reloaded: the difference to pay (held — prescription order) and the change history
      expect(find.text('Pay the difference for your change'), findsOneWidget);
      expect(find.textContaining('₹25.00 is due. Our pharmacist approves the order once it is paid.'), findsOneWidget);
      expect(find.textContaining('held now and taken only after the pharmacist’s check'), findsOneWidget);
      expect(find.text('Testamol 500: 3 → 4'), findsOneWidget);
      expect(find.text('Testirizine 10: added (1)'), findsOneWidget);
      expect(find.text('₹25.00 more — to pay'), findsOneWidget);
      expect(find.text('Sent back to our pharmacist for the prescription check.'), findsOneWidget);

      // Pay the difference with the trial's demo checkout
      await _tap(tester, find.text('Card'), settle: false);
      await _tap(tester, find.widgetWithText(ElevatedButton, 'Pay ₹25.00'), settle: false);
      await _tap(tester, find.text('Submit'), settle: false);
      await tester.pumpAndSettle();
      final pay = server.requests['POST /payments/demo']!.single as Map;
      expect(pay['order_id'], 'o1');
      expect(pay['order_edit_id'], 'e9');
      expect(pay['method'], 'card');
      expect(find.text('Pay the difference for your change'), findsNothing);
    });

    testWidgets('a trade buyer: the server asks for a prescription, the picker appears', (tester) async {
      const needRx = "Add your prescription: Testamox 250 needs a doctor's prescription.";
      _serve(tester, {
        'GET /orders/o1': [(200, _ok(_order(pricingType: 'b2b_retailer')))],
        'GET /prescriptions/my': [(200, {'success': true, 'data': []})],
        'POST /orders/o1/edit': [(422, _refused('PRESCRIPTION_REQUIRED', needRx))],
      });
      await _openOrder(tester, type: 'b2b_retailer');
      await _tap(tester, find.text('Change order'));
      await _tap(tester, find.byTooltip('Raise quantity of Testamox 250'), settle: false);
      // Trade prices: no prescription asked up front
      expect(find.byKey(const ValueKey('edit-rx-picker')), findsNothing);
      await _tap(tester, find.byKey(const ValueKey('edit-save')));
      expect(find.text(needRx), findsOneWidget);
      expect(find.byKey(const ValueKey('edit-rx-picker')), findsOneWidget);
      expect(find.text('Prescription needed for Testamox 250'), findsOneWidget);
    });

    testWidgets('409 ORDER_NOT_EDITABLE: the server sentence', (tester) async {
      const msg = 'The invoice has been issued; you can cancel or return instead.';
      _serve(tester, {
        'GET /orders/o1': [(200, _ok(_order()))],
        'POST /orders/o1/edit': [(409, _refused('ORDER_NOT_EDITABLE', msg))],
      });
      await _openOrder(tester);
      await _tap(tester, find.text('Change order'));
      await _tap(tester, find.text('Remove').first, settle: false);
      await _tap(tester, find.byKey(const ValueKey('edit-save')));
      expect(find.text(msg), findsOneWidget);
    });

    testWidgets('a doctor adding more signs a written order in the app first; the password is not kept', (tester) async {
      final server = _serve(tester, {
        'GET /orders/o1': [
          (
            200,
            _ok(_order(pricingType: 'doc_hospital', writtenOrders: [
              {'id': 'wo-first', 'kind': 'upload', 'signed_at': '2026-10-02T05:00:00Z', 'order_edit_id': null},
            ]))
          ),
        ],
        'GET /written-orders/mine': [(200, _ok({'written_orders': []}))],
        'POST /written-orders/requisition/preview': [
          (
            200,
            _ok({
              'text': 'WRITTEN ORDER FOR DRUGS (Drugs Rules 1945, r.65(9)(b))\n1. Testamol 500 — 4 unit(s)',
              'name_as_per_register': 'Asha Testkar',
            })
          ),
        ],
        'POST /written-orders/requisition': [
          (400, _refused('WRITTEN_ORDER_SIGNATURE_INVALID', 'The password is not right. The written order was not signed.')),
          (201, _ok({'id': 'wo-2', 'kind': 'in_app', 'signed_at': '2026-10-03T07:00:00Z', 'items': []})),
        ],
        'POST /orders/o1/edit': [(200, _ok({'id': 'e2', 'message': 'Your order is changed.'}))],
      });
      await _openOrder(tester, type: 'doc_hospital');
      // The order's own written order, opened through a short link
      expect(find.text('Signed written order'), findsOneWidget);
      expect(find.text('Open'), findsOneWidget);

      await _tap(tester, find.text('Change order'));
      await _tap(tester, find.byTooltip('Raise quantity of Testamol 500'), settle: false);
      await tester.pumpAndSettle();
      expect(find.text('Signed written order needed'), findsOneWidget);
      expect(find.byKey(const ValueKey('requisition-text')), findsOneWidget);
      expect(server.requests['POST /written-orders/requisition/preview']!.last, {
        'items': [
          {'product_id': 'p-a', 'quantity': 4},
        ],
      });
      final save = find.byKey(const ValueKey('edit-save'));
      expect(tester.widget<ElevatedButton>(save).onPressed, isNull);

      Future<void> sign(String password) async {
        await tester.enterText(find.byKey(const ValueKey('wo-typed-name')), 'Dr Asha Testkar');
        await tester.enterText(find.byKey(const ValueKey('wo-password')), password);
        await tester.pump();
        await _tap(tester, find.byKey(const ValueKey('wo-sign')));
      }

      await _tap(tester, find.byKey(const ValueKey('wo-declaration')), settle: false);
      await sign('wrong-pass');
      expect(find.text('The password is not right. The written order was not signed.'), findsOneWidget);
      // cleared after the try: never kept for a retry
      expect(tester.widget<TextField>(find.byKey(const ValueKey('wo-password'))).controller!.text, isEmpty);

      await sign('right-pass');
      expect((server.requests['POST /written-orders/requisition']!.last as Map)['declaration'], isTrue);
      expect((server.requests['POST /written-orders/requisition']!.last as Map)['typed_name'], 'Dr Asha Testkar');
      expect(find.text('Signed written order attached'), findsOneWidget);

      await _tap(tester, save);
      expect(server.requests['POST /orders/o1/edit']!.single, {
        'lines': [
          {'order_item_id': 'a', 'quantity': 4},
        ],
        'add': [],
        'written_order_id': 'wo-2',
      });
    });
  });

  group('doctors and institutions', () {
    final cart = CartView.fromJson({
      'items': [
        {
          'product_id': 'p1',
          'name': 'Testamol 500',
          'quantity': 2,
          'unit_price_paise': 5000,
          'mrp_paise': 6000,
          'line_subtotal_paise': 10000,
          'min_qty': 1,
          'max_qty': 100,
          'stock_qty': 50,
          'available': true,
          'requires_prescription': false,
        },
      ],
      'item_count': 1,
    });

    Future<void> openCheckout(WidgetTester tester) async {
      await tester.pumpWidget(ProviderScope(
        overrides: [
          authProvider.overrideWith((ref) => _FakeAuth('doc_hospital')),
          cartProvider.overrideWith((ref) => _FixedCart(cart)),
          addressesProvider.overrideWith((ref) async => [
                {'id': 'addr-1', 'label': 'Clinic', 'full_name': 'Test Clinic', 'pincode': '411001', 'address_line1': '1 Test Road'},
              ]),
          salesStatusProvider.overrideWith((ref) async => SalesStatus.open),
          tradePricesProvider.overrideWith((ref) async => null),
        ],
        child: const MaterialApp(home: CheckoutScreen()),
      ));
      await tester.pumpAndSettle();
    }

    testWidgets('registration lapsed: the server reason, and checkout cannot go on', (tester) async {
      _serve(tester, {
        'GET /practitioner-sales/me': [(200, _ok(_registration(canOrder: false)))],
      });
      await openCheckout(tester);
      expect(find.text(_paused), findsOneWidget);
      expect(tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'Review order')).onPressed, isNull);
    });

    testWidgets('written order before placing; a refusal sends the doctor back to it; placed with written_order_id',
        (tester) async {
      const tooOld = 'This written order is older than 30 days. Sign or upload a new one.';
      final server = _serve(tester, {
        'GET /practitioner-sales/me': [(200, _ok(_registration()))],
        'POST /orders/preview': [
          (
            200,
            _ok({
              'shipments': [
                {'seller_type': 'dawabag', 'seller_name': 'Dawabag', 'lines': [], 'total_paise': 10000},
              ],
              'charges': {'items_paise': 10000, 'total_payable_paise': 10000},
              'written_order_required': true,
            })
          ),
        ],
        'GET /written-orders/mine': [
          (
            200,
            _ok({
              'written_orders': [
                {'id': 'wo-old', 'kind': 'upload', 'signed_at': '2026-09-01T05:00:00Z', 'document_name': 'requisition.pdf'},
              ],
            })
          ),
        ],
        'POST /written-orders/requisition/preview': [(200, _ok({'text': 'WRITTEN ORDER', 'name_as_per_register': 'Asha Testkar'}))],
        'POST /orders': [
          (422, _refused('WRITTEN_ORDER_TOO_OLD', tooOld)),
          (
            201,
            _ok({
              'order': {
                'id': 'o9',
                'order_number': 'DWB-TEST-45',
                'invoice_number': null,
                'total_paise': 10000,
                'shipments': [
                  {'id': 's9', 'seller_type': 'dawabag', 'invoice_number': null, 'total_paise': 10000},
                ],
              },
            })
          ),
        ],
      });
      await openCheckout(tester);
      expect(find.text(_paused), findsNothing);
      await _tap(tester, find.widgetWithText(ElevatedButton, 'Review order'));
      expect(find.text('Continue to written order'), findsOneWidget);
      await _tap(tester, find.byType(CheckboxListTile)); // own-patients declaration (C-15)
      await _tap(tester, find.text('Continue to written order'));
      expect(find.text('Written order'), findsWidgets);
      expect(find.text('Medical council registration: Verified, valid till 2027-03-31'), findsOneWidget);
      expect(tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'Sign or upload the written order')).onPressed,
          isNull);

      // Reuse a recent one; the server refuses it as too old
      await _tap(tester, find.byKey(const ValueKey('wo-reuse-wo-old')));
      expect(find.text('Signed written order attached'), findsOneWidget);
      await _tap(tester, find.text('Place order and pay'));
      expect((server.requests['POST /orders']!.first as Map)['written_order_id'], 'wo-old');
      expect(find.text(tooOld), findsOneWidget);
      expect(find.text('Signed written order needed'), findsOneWidget);

      await _tap(tester, find.byKey(const ValueKey('wo-reuse-wo-old')));
      await _tap(tester, find.text('Place order and pay'));
      final body = server.requests['POST /orders']!.last as Map;
      expect(body['written_order_id'], 'wo-old');
      expect(body['practitioner_declaration'], isTrue);
      // Placed: on to payment
      expect(find.text('DWB-TEST-45'), findsOneWidget);
    });

    testWidgets('account: registration status, the reason orders are paused, and the renewed certificate', (tester) async {
      _serve(tester, {
        'GET /practitioner-sales/me': [(200, _ok(_registration(canOrder: false)))],
      });
      await tester.pumpWidget(ProviderScope(
        overrides: [authProvider.overrideWith((ref) => _FakeAuth('doc_hospital'))],
        child: const MaterialApp(home: AccountScreen()),
      ));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('registration-status')), findsOneWidget);
      expect(find.text(_paused), findsOneWidget);
      expect(find.textContaining('TMC-2011-0042'), findsOneWidget);
      expect(find.text('Certificate photo'), findsOneWidget);
      expect(find.text('Certificate PDF'), findsOneWidget);
    });

    testWidgets('account: nothing for other buyers', (tester) async {
      final server = _serve(tester, {});
      await tester.pumpWidget(ProviderScope(
        overrides: [authProvider.overrideWith((ref) => _FakeAuth('customer'))],
        child: const MaterialApp(home: AccountScreen()),
      ));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('registration-status')), findsNothing);
      expect(server.requests.containsKey('GET /practitioner-sales/me'), isFalse);
    });
  });
}
