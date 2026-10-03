import 'package:dawabag/config/theme.dart';
import 'package:dawabag/providers/order_detail_provider.dart';
import 'package:dawabag/screens/orders/order_detail_screen.dart';
import 'package:dawabag/screens/orders/widgets/order_timeline.dart';
import 'package:dawabag/screens/orders/widgets/order_timeline_card.dart';
import 'package:dawabag/screens/orders/widgets/shipment_tile.dart';
import 'package:dawabag/utils/pharmacist_check.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

// Sprint 36 (app): the "Pharmacist check" step of every order (Sprint 35 owner
// decision, C-08), read from GET /orders/:id — pharmacist_check on the order
// and pharmacist_check / _name / _reg_no / _checked_at on each shipment.

Map<String, dynamic> _ship(String check,
        {String seller = 'Dawabag', String? name, String? reg, String? at, String status = 'pending'}) =>
    {
      'id': 's-$seller',
      'seller_type': seller == 'Dawabag' ? 'dawabag' : 'partner',
      'seller_name': seller,
      'status': status,
      'pharmacist_check': check,
      'pharmacist_name': name,
      'pharmacist_reg_no': reg,
      'pharmacist_checked_at': at,
    };

Map<String, dynamic> _order(String status, String? check, List<Map<String, dynamic>> shipments,
        {bool rx = false, String? cancellationReason}) =>
    {
      'id': 'o1',
      'order_number': 'DB-1001',
      'status': status,
      'created_at': '2026-10-02T05:00:00Z',
      'requires_prescription': rx,
      'pharmacist_check': check,
      'shipments': shipments,
      'items': const [],
      'can_cancel': false,
      'cancellation_reason': cancellationReason,
      'total_paise': 45000,
    };

Widget _card(Map<String, dynamic> order) => MaterialApp(
      theme: AppTheme.lightTheme(googleFonts: false),
      home: Scaffold(body: SingleChildScrollView(child: OrderTimelineCard(order: order))),
    );

void main() {
  group('timeline logic', () {
    test('every order has a Pharmacist check step; no separate "Prescription verified"', () {
      final plain = timelineFor('confirmed', requiresPrescription: false, pharmacistCheck: 'pending');
      expect(plain.steps.map((s) => s.key), ['placed', 'check', 'packed', 'dispatched', 'delivered']);
      final rx = timelineFor('rx_pending', requiresPrescription: true, pharmacistCheck: 'pending');
      expect(rx.steps.map((s) => s.label),
          ['Order placed', 'Prescription submitted', 'Pharmacist check', 'Order packed', 'Dispatched', 'Delivered']);
      expect(rx.step('rx')!.active, isTrue);
      expect(rx.step('check')!.active, isTrue);
    });

    test('pending: the check is the current step; released: done', () {
      final pending = timelineFor('confirmed', requiresPrescription: false, pharmacistCheck: 'pending');
      expect(pending.step('check')!.active, isTrue);
      expect(pending.step('check')!.done, isFalse);
      expect(pending.step('check')!.note, kCheckingNote);
      final released = timelineFor('packing', requiresPrescription: false, pharmacistCheck: 'released');
      expect(released.step('check')!.done, isTrue);
      expect(released.step('packed')!.done, isFalse);
    });

    test('held: amber note, still active; rejected: not active, no duplicate cancelled note', () {
      final held = timelineFor('confirmed', pharmacistCheck: 'held', requiresPrescription: false);
      expect(held.step('check')!.warn, isTrue);
      expect(held.step('check')!.note, kHeldTitle);
      expect(held.step('check')!.active, isTrue);
      final rejected = timelineFor('cancelled', pharmacistCheck: 'rejected', requiresPrescription: false);
      expect(rejected.step('check')!.active, isFalse);
      expect(rejected.step('check')!.done, isFalse);
      expect(rejected.note, isNull);
      expect(timelineFor('cancelled', pharmacistCheck: 'pending').note, 'This order was cancelled.');
    });

    test('parcels packed before Sprint 35 (not_recorded) and older servers (no field) still read sensibly', () {
      expect(timelineFor('dispatched', pharmacistCheck: 'not_recorded').step('check')!.done, isTrue);
      expect(timelineFor('delivered').step('check')!.done, isTrue);
      expect(timelineFor('confirmed', requiresPrescription: false).step('check')!.active, isTrue);
      expect(timelineFor('some_new_status').note, 'Current status: some new status');
    });

    test('checked-by lines name the pharmacist, registration and time (IST); sellers named when several', () {
      final one = _order('packing', 'released',
          [_ship('released', name: 'Asha Rao', reg: 'MH-12345', at: '2026-10-02T09:45:00Z')]);
      final lines = pharmacistLines(one);
      expect(lines.single.text, 'Checked by pharmacist Asha Rao, Reg. no. MH-12345');
      expect(lines.single.when, '02 Oct 2026, 3:15 PM IST');
      final two = _order('packing', 'released', [
        _ship('released', name: 'Asha Rao', reg: 'MH-1'),
        _ship('released', seller: 'Care Pharmacy', name: 'Vikram Shah', reg: 'MH-2'),
      ]);
      expect(pharmacistLines(two).map((l) => l.text), [
        'Dawabag: Checked by pharmacist Asha Rao, Reg. no. MH-1',
        'Care Pharmacy: Checked by pharmacist Vikram Shah, Reg. no. MH-2',
      ]);
      // A hold never names anyone (the server blanks it for the buyer)
      expect(pharmacistLines(_order('confirmed', 'held', [_ship('held')])), isEmpty);
    });

    test('refusal reason comes from the cancellation reason the server wrote', () {
      final o = _order('cancelled', 'rejected', [_ship('rejected', name: 'Asha Rao', reg: 'MH-1', status: 'cancelled')],
          cancellationReason: "Not supplied after the pharmacist's check: Dose too high for the stated age");
      expect(refusalReason(o), 'Dose too high for the stated age');
      expect(refusalReason({...o, 'cancellation_reason': 'Cancelled by Dawabag'}), isNull);
      expect(refusalReason({...o, 'pharmacist_check': 'released'}), isNull);
    });

    test('header chip while the check is open', () {
      expect(checkChipLabel('confirmed', 'pending'), 'Pharmacist check');
      expect(checkChipLabel('packing', 'held'), kHeldChip);
      expect(checkChipLabel('dispatched', 'released'), isNull);
      expect(checkChipLabel('cancelled', 'held'), isNull);
    });
  });

  group('timeline card', () {
    testWidgets('released: "Checked by pharmacist <name>, Reg. no. <no>" with the time', (tester) async {
      await tester.pumpWidget(_card(_order('packing', 'released',
          [_ship('released', name: 'Asha Rao', reg: 'MH-12345', at: '2026-10-02T09:45:00Z')])));
      expect(find.text('Pharmacist check'), findsOneWidget);
      expect(find.textContaining('Checked by pharmacist Asha Rao, Reg. no. MH-12345'), findsOneWidget);
      expect(find.textContaining('02 Oct 2026, 3:15 PM IST'), findsOneWidget);
    });

    testWidgets('held: "On hold — our pharmacist needs to talk to you", in plain words', (tester) async {
      await tester.pumpWidget(_card(_order('confirmed', 'held', [_ship('held')])));
      expect(find.byKey(const ValueKey('check-held')), findsOneWidget);
      expect(find.text(kHeldTitle), findsNWidgets(2)); // the step note and the box title
      expect(find.text(kHeldText), findsOneWidget);
      expect(find.text('Write to us about this order'), findsOneWidget);
      expect(find.textContaining('Checked by'), findsNothing);
    });

    testWidgets('rejected: cancelled and refunded, with the reason and who decided', (tester) async {
      await tester.pumpWidget(_card(_order('cancelled', 'rejected',
          [_ship('rejected', name: 'Asha Rao', reg: 'MH-1', status: 'cancelled')],
          cancellationReason: "Not supplied after the pharmacist's check: Needs a doctor's review first")));
      expect(find.byKey(const ValueKey('check-rejected')), findsOneWidget);
      expect(find.text(kRejectedTitle), findsOneWidget);
      expect(find.text(kRejectedText), findsOneWidget);
      expect(find.text("Reason: Needs a doctor's review first"), findsOneWidget);
      expect(find.text('Decided by pharmacist Asha Rao, Reg. no. MH-1'), findsOneWidget);
      expect(find.text('This order was cancelled.'), findsNothing);
    });

    testWidgets('held: "Write to us" opens a complaint linked to the order', (tester) async {
      String? opened;
      final router = GoRouter(routes: [
        GoRoute(
            path: '/',
            builder: (c, s) => Scaffold(
                body: SingleChildScrollView(
                    child: OrderTimelineCard(order: _order('confirmed', 'held', [_ship('held')]))))),
        GoRoute(
            path: '/account/complaints/new',
            builder: (c, s) {
              opened = s.uri.toString();
              return const Scaffold(body: Text('new complaint'));
            }),
      ]);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      await tester.tap(find.text('Write to us about this order'));
      await tester.pumpAndSettle();
      expect(opened, contains('orderId=o1'));
      expect(opened, contains('orderNumber=DB-1001'));
    });
  });

  testWidgets('shipment tile: who checked it, or that it is on hold', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Column(children: [
          ShipmentTile(shipment: _ship('released', name: 'Asha Rao', reg: 'MH-1'), sellerLabel: 'Sold by Dawabag'),
          ShipmentTile(shipment: _ship('held', seller: 'Care'), sellerLabel: 'Sold by Care'),
          ShipmentTile(shipment: _ship('pending', seller: 'Other'), sellerLabel: 'Sold by Other'),
        ]),
      ),
    ));
    expect(find.textContaining('Checked by pharmacist Asha Rao, Reg. no. MH-1'), findsOneWidget);
    expect(find.text('On hold — our pharmacist will contact you'), findsOneWidget);
    expect(find.text('Waiting for the pharmacist check'), findsOneWidget);
  });

  testWidgets('order detail: the header says "On hold — pharmacist will call" and fits 360 dp', (tester) async {
    tester.view.physicalSize = const Size(360 * 3, 800 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final order = _order('confirmed', 'held', [_ship('held')]);
    await tester.pumpWidget(ProviderScope(
      overrides: [orderDetailProvider('o1').overrideWith((ref) async => order)],
      child: MaterialApp(theme: AppTheme.lightTheme(googleFonts: false), home: const OrderDetailScreen(orderId: 'o1')),
    ));
    await tester.pump();
    await tester.pump();
    expect(find.text(kHeldChip), findsOneWidget);
    expect(find.text(kHeldText), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
