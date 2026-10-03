import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/models/checkout_summary.dart';
import 'package:dawabag/screens/checkout/checkout_flow.dart';
import 'package:dawabag/screens/checkout/widgets/prescription_step.dart';
import 'package:dawabag/screens/checkout/widgets/review_step.dart';
import 'package:dawabag/screens/checkout/widgets/rx_policy_note.dart';

// Sprint 32: the app's checkout now runs in the web's order (Sprint 26):
// address → prescription → review → place order (then the chosen prescription
// is sent with it) → payment. Made-up order numbers and prescriptions.

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child)));

Map<String, dynamic> _rx(String id, String status, {String created = '2026-10-02T04:26:00Z', String? validUntil}) =>
    {'id': id, 'status': status, 'created_at': created, 'file_type': 'jpg', 'valid_until': validUntil};

void main() {
  group('step order', () {
    test('the prescription is chosen before review, and review before payment', () {
      expect(checkoutBarLabels(true), ['Address', 'Prescription', 'Review', 'Payment']);
      expect(checkoutBarLabels(false), ['Address', 'Review', 'Payment']);

      final path = <CheckoutStep>[CheckoutStep.address];
      while (path.last != CheckoutStep.confirmed) {
        path.add(checkoutNextStep(path.last, hasRx: true));
      }
      expect(path, [
        CheckoutStep.address,
        CheckoutStep.prescription,
        CheckoutStep.review,
        CheckoutStep.payment,
        CheckoutStep.confirmed,
      ]);
      expect(checkoutNextStep(CheckoutStep.address, hasRx: false), CheckoutStep.review);

      expect(CheckoutStep.prescription.barIndex(true), 1);
      expect(CheckoutStep.review.barIndex(true), 2);
      expect(CheckoutStep.payment.barIndex(true), 3);
      expect(CheckoutStep.rxFix.barIndex(true), 1);
      expect(CheckoutStep.review.barIndex(false), 1);
    });

    test('Back: review → prescription before placing; nothing before payment once placed', () {
      expect(checkoutPreviousStep(CheckoutStep.review, hasRx: true, orderPlaced: false), CheckoutStep.prescription);
      expect(checkoutPreviousStep(CheckoutStep.review, hasRx: false, orderPlaced: false), CheckoutStep.address);
      expect(checkoutPreviousStep(CheckoutStep.prescription, hasRx: true, orderPlaced: false), CheckoutStep.address);
      expect(checkoutPreviousStep(CheckoutStep.review, hasRx: true, orderPlaced: true), isNull);
      expect(checkoutPreviousStep(CheckoutStep.rxFix, hasRx: true, orderPlaced: true), isNull);
    });

    test('button words', () {
      expect(CheckoutStep.address.buttonLabel(totalPaise: 0, orderPlaced: false, hasRx: true), 'Continue to prescription');
      expect(CheckoutStep.address.buttonLabel(totalPaise: 0, orderPlaced: false), 'Review order');
      expect(CheckoutStep.prescription.buttonLabel(totalPaise: 0, orderPlaced: false), 'Choose or upload a prescription');
      expect(CheckoutStep.prescription.buttonLabel(totalPaise: 0, orderPlaced: false, rxChosen: true), 'Continue to review');
      expect(CheckoutStep.review.buttonLabel(totalPaise: 0, orderPlaced: false), 'Place order and pay');
      expect(CheckoutStep.rxFix.buttonLabel(totalPaise: 0, orderPlaced: true, rxChosen: true), 'Continue to payment');
    });
  });

  group('placing the order (Sprint 39: the prescription goes WITH the order)', () {
    const rxOrder = PlacedOrder(id: 'o1', orderNumber: 'DWB-1', totalPaise: 10000, requiresPrescription: true);

    test('a payment refused for want of a prescription: send one with the placed order, then pay', () async {
      final calls = <String>[];
      final out = await attachRxToPlacedOrder(rxOrder,
          attach: (orderId) async => calls.add('POST /prescriptions/rx1/use-for-order $orderId'),
          rxChosen: true,
          errorText: (e) => '$e');
      expect(calls, ['POST /prescriptions/rx1/use-for-order o1']);
      expect(out.next, CheckoutStep.payment);
      expect(out.rxError, isNull);
    });

    test('a refused prescription keeps the order and asks for another one', () async {
      final out = await attachRxToPlacedOrder(rxOrder,
          attach: (_) async => throw 'This prescription has expired.', rxChosen: true, errorText: (e) => '$e');
      expect(out.order.orderNumber, 'DWB-1');
      expect(out.next, CheckoutStep.rxFix);
      expect(out.rxError, 'This prescription has expired. Please choose or upload another one for order DWB-1.');
    });

    test('nothing chosen yet: stays on the prescription step', () async {
      var attached = false;
      final out = await attachRxToPlacedOrder(rxOrder,
          attach: (_) async => attached = true, rxChosen: false, errorText: (e) => '$e');
      expect(attached, isFalse);
      expect(out.next, CheckoutStep.rxFix);
    });
  });

  group('prescription step', () {
    testWidgets('cards with date and time, status and "Chosen"; upload new; rejection policy', (tester) async {
      var photo = 0;
      String? chosen;
      await tester.pumpWidget(_wrap(PrescriptionStep(
        rxItems: const ['Amoxicillin 500 mg Capsule × 1'],
        prescriptions: [
          _rx('rx1', 'pending'),
          _rx('rx2', 'verified', created: '2026-09-20T10:00:00Z', validUntil: '2027-03-20'),
        ],
        selectedId: 'rx1',
        onSelect: (id) => chosen = id,
        onPhoto: () => photo++,
        onPdf: () {},
      )));
      expect(find.text('Choose one of your prescriptions'), findsOneWidget);
      expect(find.text('Uploaded 02 Oct 2026, 9:56 AM'), findsOneWidget);
      expect(find.text('Uploaded — not checked yet'), findsOneWidget);
      expect(find.text('Checked by our pharmacist'), findsOneWidget);
      expect(find.text('Chosen'), findsOneWidget);
      await tester.tap(find.text('Checked by our pharmacist'));
      expect(chosen, 'rx2');

      expect(find.text('Or upload a new one'), findsOneWidget);
      await tester.tap(find.text('Take or choose a photo'));
      expect(photo, 1);

      // C-08 / C-37: plain words on what happens if it is not accepted
      expect(find.byType(RxPolicyNote), findsOneWidget);
      expect(find.textContaining('we tell you why'), findsOneWidget);
      expect(find.textContaining('you are not charged'), findsOneWidget);
    });

    testWidgets('no prescriptions yet: upload yours; more than four: Show all', (tester) async {
      await tester.pumpWidget(_wrap(PrescriptionStep(
        rxItems: const [],
        prescriptions: const [],
        selectedId: null,
        onSelect: (_) {},
        onPhoto: () {},
        onPdf: () {},
      )));
      expect(find.text('Upload your prescription'), findsOneWidget);
      expect(find.text('Choose one of your prescriptions'), findsNothing);

      await tester.pumpWidget(_wrap(PrescriptionStep(
        rxItems: const [],
        prescriptions: [for (var i = 0; i < 6; i++) _rx('r$i', 'pending')],
        selectedId: null,
        onSelect: (_) {},
        onPhoto: () {},
        onPdf: () {},
        error: 'This prescription has expired. Please choose or upload another one for order DWB-1.',
      )));
      expect(find.text('Uploaded — not checked yet'), findsNWidgets(4));
      await tester.tap(find.text('Show all 6 prescriptions'));
      await tester.pump();
      expect(find.text('Uploaded — not checked yet'), findsNWidgets(6));
      expect(find.textContaining('for order DWB-1'), findsOneWidget);
    });
  });

  testWidgets('review names the chosen prescription with Change, before the order is placed', (tester) async {
    var changed = 0;
    final summary = CheckoutSummary.fromJson(const {'shipments': [], 'charges': {'total_payable_paise': 10000}});
    await tester.pumpWidget(_wrap(ReviewStep(
      summary: summary,
      isPractitioner: false,
      declared: false,
      onDeclared: (_) {},
      orderPlaced: false,
      rxLabel: 'photo uploaded 02 Oct 2026, 9:56 am',
      onChangeRx: () => changed++,
    )));
    expect(find.textContaining('Prescription (photo uploaded 02 Oct 2026, 9:56 am) ✓'), findsOneWidget);
    expect(find.byType(RxPolicyNote), findsOneWidget);
    await tester.tap(find.text('Change'));
    expect(changed, 1);
  });
}
