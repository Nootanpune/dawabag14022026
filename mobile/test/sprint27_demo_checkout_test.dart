// Sprint 27 — the trial's demo checkout mimics Razorpay's steps: choosing a way
// to pay opens that method's own step; only the last screen records the answer.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/screens/checkout/widgets/confirmed_step.dart';
import 'package:dawabag/services/payment_api.dart';
import 'package:dawabag/widgets/payments/demo_checkout/demo_checkout.dart';
import 'package:dawabag/widgets/payments/demo_checkout/demo_checkout_data.dart';

const _providers = {
  'netbanking': ['SBI', 'HDFC', 'ICICI', 'Axis', 'Kotak'],
  'wallet': ['Paytm', 'PhonePe', 'Amazon Pay', 'Mobikwik'],
};

/// Pumps the demo checkout; every answer is recorded in [calls] and answered as the server would.
Future<List<String>> _pump(WidgetTester tester) async {
  final calls = <String>[];
  await tester.binding.setSurfaceSize(const Size(420, 1400));
  addTearDown(() => tester.binding.setSurfaceSize(null));
  await tester.pumpWidget(MaterialApp(
    home: Scaffold(
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: DemoCheckout(
          amountPaise: 30000,
          methods: const ['upi', 'card', 'netbanking', 'wallet'],
          providers: _providers,
          onPay: (c, success) async {
            calls.add('${c.method}:${c.provider ?? '-'}:${success ? 'success' : 'failure'}');
            return success;
          },
        ),
      ),
    ),
  ));
  return calls;
}

Future<void> _tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  await tester.pump();
}

final _pay = find.widgetWithText(ElevatedButton, 'Pay ₹300.00');
const _banner = 'Demo payment — no money moves';

void main() {
  test('server options carry the demo banks and wallets', () {
    final o = PaymentOptions.fromJson({'mode': 'demo', 'methods': ['upi'], 'providers': _providers});
    expect(o.providers['netbanking'], ['SBI', 'HDFC', 'ICICI', 'Axis', 'Kotak']);
    expect(const PaymentOptions().providers, isEmpty);
  });

  test('UPI ids, and how the confirmation names each payment', () {
    expect(isValidVpa('demo@upi'), isTrue);
    expect(isValidVpa('ravi.k@okbank'), isTrue);
    expect(isValidVpa('not-an-id'), isFalse);
    expect(isValidVpa('a@'), isFalse);
    expect(paidByLabel(const DemoChoice('upi')), 'Paid by UPI (demo)');
    expect(paidByLabel(const DemoChoice('card')), 'Card ending 1111 (demo)');
    expect(paidByLabel(const DemoChoice('netbanking', 'HDFC')), 'HDFC netbanking (demo)');
    expect(paidByLabel(const DemoChoice('wallet', 'PhonePe')), 'PhonePe (demo)');
  });

  testWidgets('UPI: tile opens the UPI step (nothing paid); Change method goes back; approve pays', (tester) async {
    final calls = await _pump(tester);
    expect(find.textContaining(_banner), findsOneWidget);
    await _tap(tester, find.text('UPI'));
    expect(find.text('Pay by UPI'), findsOneWidget);
    expect(calls, isEmpty);
    await _tap(tester, find.text('Change method'));
    expect(find.text('Choose how to pay ₹300.00'), findsOneWidget);
    await _tap(tester, find.text('UPI'));
    // UPI id pre-filled and checked; the QR is a labelled demo picture
    expect(find.widgetWithText(TextField, 'demo@upi'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'nope');
    await tester.pump();
    expect(find.textContaining('Write it as name@bank'), findsOneWidget);
    expect(tester.widget<ElevatedButton>(_pay).onPressed, isNull);
    await _tap(tester, find.text('Scan QR'));
    expect(find.bySemanticsLabel(RegExp('Demo QR picture — not a real payment code')), findsOneWidget);
    await _tap(tester, find.text('Pay by UPI ID'));
    await tester.enterText(find.byType(TextField), 'ravi.k@okbank');
    await tester.pump();
    await _tap(tester, _pay);
    expect(find.text('Approve the payment in your UPI app'), findsOneWidget);
    expect(find.textContaining('ravi.k@okbank'), findsOneWidget);
    expect(find.text('Waiting for approval… 2:00 left'), findsOneWidget);
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('Waiting for approval… 1:59 left'), findsOneWidget);
    expect(find.textContaining(_banner), findsOneWidget);
    expect(calls, isEmpty);
    await _tap(tester, find.text('Approve (demo)'));
    expect(calls, ['upi:-:success']);
  });

  testWidgets('UPI decline: plain failure message, Try again returns to the ways to pay', (tester) async {
    final calls = await _pump(tester);
    await _tap(tester, find.text('UPI'));
    await _tap(tester, _pay);
    await _tap(tester, find.text('Decline (demo)'));
    expect(find.text(demoFailedText), findsOneWidget);
    expect(find.textContaining(_banner), findsOneWidget);
    expect(calls, ['upi:-:failure']);
    await _tap(tester, find.text('Try again'));
    expect(find.text('Choose how to pay ₹300.00'), findsOneWidget);
  });

  testWidgets('card: a read-only test card, then a bank OTP; Submit pays', (tester) async {
    final calls = await _pump(tester);
    await _tap(tester, find.text('Card'));
    expect(find.textContaining('Demo — do not enter a real card'), findsOneWidget);
    final number = tester.widget<TextField>(find.widgetWithText(TextField, '4111 1111 1111 1111'));
    expect(number.readOnly, isTrue);
    expect(find.widgetWithText(TextField, 'Demo Customer'), findsOneWidget);
    await _tap(tester, _pay);
    expect(find.text('Bank OTP (demo)'), findsOneWidget);
    expect(find.widgetWithText(TextField, '123456'), findsOneWidget);
    expect(find.text('Fail (demo)'), findsOneWidget);
    await _tap(tester, find.text('Go back'));
    expect(find.text('Pay by card'), findsOneWidget);
    await _tap(tester, _pay);
    await _tap(tester, find.text('Submit'));
    expect(calls, ['card:-:success']);
  });

  testWidgets('netbanking: choose a bank, its demo page, Success', (tester) async {
    final calls = await _pump(tester);
    await _tap(tester, find.text('Netbanking'));
    for (final b in _providers['netbanking']!) {
      expect(find.text(b), findsOneWidget);
    }
    expect(tester.widget<ElevatedButton>(_pay).onPressed, isNull);
    await _tap(tester, find.text('HDFC'));
    await _tap(tester, _pay);
    expect(find.text('HDFC (demo) bank page'), findsOneWidget);
    await _tap(tester, find.text('Success'));
    expect(calls, ['netbanking:HDFC:success']);
  });

  testWidgets('wallet: choose PhonePe, Decline → nothing taken', (tester) async {
    final calls = await _pump(tester);
    await _tap(tester, find.text('Wallet'));
    await _tap(tester, find.text('PhonePe'));
    await _tap(tester, _pay);
    expect(find.text('PhonePe wallet (demo)'), findsOneWidget);
    await _tap(tester, find.text('Decline (demo)'));
    expect(calls, ['wallet:PhonePe:failure']);
    expect(find.text(demoFailedText), findsOneWidget);
  });

  testWidgets('the confirmation names how it was paid', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: Scaffold(body: SingleChildScrollView(child: ConfirmedStep(orderNumber: 'DWB-9', demo: true, paidBy: 'HDFC netbanking (demo)'))),
    ));
    expect(find.text('Paid by: HDFC netbanking (demo)'), findsOneWidget);
    expect(find.text('Demo payment — no money moved'), findsOneWidget);
  });
}
