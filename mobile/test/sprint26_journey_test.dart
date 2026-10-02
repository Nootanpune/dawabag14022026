import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/screens/checkout/widgets/payment_step.dart';
import 'package:dawabag/screens/checkout/widgets/prescription_step.dart';
import 'package:dawabag/screens/checkout/widgets/rx_policy_note.dart';
import 'package:dawabag/services/payment_api.dart';
import 'package:dawabag/widgets/cart_quantity_control.dart';
import 'package:dawabag/widgets/quantity_stepper.dart';

Widget _wrap(Widget child) => ProviderScope(
      child: MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child))),
    );

void main() {
  group('quantity stepper (Sprint 26)', () {
    testWidgets('− and + call back; at the minimum − removes', (tester) async {
      var down = 0, up = 0;
      await tester.pumpWidget(_wrap(QuantityStepper(name: 'Cetirizine', quantity: 1, onDecrease: () => down++, onIncrease: () => up++)));
      expect(find.text('1'), findsOneWidget);
      expect(find.byTooltip('Remove Cetirizine from cart'), findsOneWidget);
      await tester.tap(find.byTooltip('Remove Cetirizine from cart'));
      await tester.tap(find.byTooltip('Increase quantity of Cetirizine'));
      expect((down, up), (1, 1));
    });
    testWidgets('+ is off at the limit', (tester) async {
      var up = 0;
      await tester.pumpWidget(_wrap(QuantityStepper(name: 'X', quantity: 10, canIncrease: false, onDecrease: () {}, onIncrease: () => up++)));
      expect(find.byTooltip('Decrease quantity of X'), findsOneWidget);
      await tester.tap(find.byTooltip('Increase quantity of X'));
      expect(up, 0);
    });
    testWidgets('a medicine not in the cart shows Add (or out of stock)', (tester) async {
      await tester.pumpWidget(_wrap(const CartQuantityControl(product: {'id': 'p1', 'name': 'P', 'in_stock': true}, compact: true)));
      expect(find.text('Add'), findsOneWidget);
      await tester.pumpWidget(_wrap(const CartQuantityControl(product: {'id': 'p2', 'name': 'Q', 'in_stock': false})));
      expect(find.text('Out of stock'), findsOneWidget);
    });
  });

  group('payment step', () {
    test('payment options from the server', () {
      final o = PaymentOptions.fromJson({'mode': 'demo', 'methods': ['upi', 'card'], 'cash_on_delivery': false});
      expect(o.isDemo, isTrue);
      expect(o.methods, ['upi', 'card']);
      expect(const PaymentOptions().mode, 'unavailable');
    });
    testWidgets('trial demo: labelled, method tiles (the demo checkout); the prescription is named', (tester) async {
      await tester.pumpWidget(_wrap(PaymentStep(
        orderNumber: 'DWB-1', totalPaise: 30000,
        options: const PaymentOptions(mode: 'demo', methods: ['upi', 'card', 'netbanking', 'wallet']),
        onDemoPay: (_, __) async => true,
        prescriptionLabel: 'photo uploaded 02 Oct 2026, 9:56 am',
      )));
      expect(find.textContaining('Demo payment — no money moves'), findsOneWidget);
      for (final m in ['UPI', 'Card', 'Netbanking', 'Wallet']) {
        expect(find.text(m), findsOneWidget);
      }
      expect(find.textContaining('Prescription (photo uploaded 02 Oct 2026, 9:56 am) ✓'), findsOneWidget);
      expect(find.textContaining('get a full refund'), findsOneWidget);
    });
    testWidgets('no way to pay online: a plain sentence', (tester) async {
      await tester.pumpWidget(_wrap(const PaymentStep(orderNumber: 'DWB-2', totalPaise: 100, options: PaymentOptions())));
      expect(find.textContaining('Online payment is not available right now'), findsOneWidget);
    });
  });

  testWidgets('prescription step lists the medicines that need one and marks the chosen prescription', (tester) async {
    await tester.pumpWidget(_wrap(PrescriptionStep(
      prescriptionFile: null,
      savedPrescriptions: const [
        {'id': 'rx1', 'status': 'pending', 'created_at': '2026-10-02T04:26:00Z', 'file_type': 'jpg'},
      ],
      selectedSavedId: 'rx1',
      onPickFile: () {},
      onSelectSaved: (_) {},
      rxItems: const ['Amoxicillin 500 mg Capsule × 1'],
    )));
    expect(find.text('Prescription needed'), findsOneWidget);
    expect(find.textContaining('Amoxicillin 500 mg Capsule × 1'), findsOneWidget);
    expect(find.text('Chosen'), findsOneWidget);
    expect(find.textContaining('Uploaded 02 Oct 2026'), findsOneWidget);
    expect(find.byType(RxPolicyNote), findsOneWidget);
  });
}
