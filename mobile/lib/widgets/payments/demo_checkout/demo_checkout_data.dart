/// The trial's demo checkout (Sprint 27): the same steps as Razorpay's window —
/// choose a way to pay, then that method's own step, then approve or decline —
/// with no money moving. The card is a fixed test card shown read-only and never
/// sent; the QR is a drawing, not a payable code; only the method and the bank or
/// wallet name reach the server (audit, C-46).
library;

/// What the buyer chose: provider = the bank or wallet (never card data).
class DemoChoice {
  final String method;
  final String? provider;
  const DemoChoice(this.method, [this.provider]);
}

/// Records the payment on the server; true when paid, false when declined.
/// Throws when the request fails (the checkout shows the error and stays put).
typedef DemoPay = Future<bool> Function(DemoChoice choice, bool success);

const demoVpa = 'demo@upi';
final _vpa = RegExp(r'^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9]{1,63}$', caseSensitive: false);

/// name@handle, as UPI ids are written (e.g. ravi.k@okbank)
bool isValidVpa(String v) => _vpa.hasMatch(v.trim());

/// A well-known test card number (accepted by no bank). Shown read-only; never sent.
const demoCardNumber = '4111 1111 1111 1111';
const demoCardLast4 = '1111';
const demoCardCvv = '123';
const demoCardName = 'Demo Customer';
String demoCardExpiry([DateTime? now]) => '12/${(((now ?? DateTime.now()).year + 3) % 100).toString().padLeft(2, '0')}';
const demoOtp = '123456';

/// How long the UPI request waits for approval
const upiWaitSeconds = 120;


/// How the confirmation names the payment, e.g. "HDFC netbanking (demo)".
String paidByLabel(DemoChoice c) => switch (c.method) {
      'upi' => 'Paid by UPI (demo)',
      'card' => 'Card ending $demoCardLast4 (demo)',
      'netbanking' => '${c.provider ?? 'Bank'} netbanking (demo)',
      'wallet' => '${c.provider ?? 'Wallet'} (demo)',
      _ => 'Demo payment',
    };

const methodStepTitles = {
  'upi': 'Pay by UPI',
  'card': 'Pay by card',
  'netbanking': 'Pay by netbanking',
  'wallet': 'Pay from a wallet',
};

String formatCountdown(int s) => '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';

const demoFailedText = "Payment didn't go through. No money was taken. You can try again.";
