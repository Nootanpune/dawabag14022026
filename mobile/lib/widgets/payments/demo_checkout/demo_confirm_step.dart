import 'dart:async';

import 'package:flutter/material.dart';

import '../../../utils/formatters.dart';
import 'demo_checkout_data.dart';

/// The last screen of a demo payment — what the UPI app, bank or wallet would
/// show. Only its two buttons call the server.
class DemoConfirmStep extends StatefulWidget {
  final DemoChoice choice;
  final String? vpa;
  final int amountPaise;
  /// 'success' / 'failure' while that answer is being recorded
  final String? busy;
  final ValueChanged<bool> onAnswer;
  final VoidCallback onRestart;
  final Widget Function(String title) heading;

  const DemoConfirmStep({
    super.key,
    required this.choice,
    this.vpa,
    required this.amountPaise,
    this.busy,
    required this.onAnswer,
    required this.onRestart,
    required this.heading,
  });

  @override
  State<DemoConfirmStep> createState() => _DemoConfirmStepState();
}

class _DemoConfirmStepState extends State<DemoConfirmStep> {
  Timer? _timer;
  int _left = upiWaitSeconds;

  bool get _waits => widget.choice.method == 'upi';

  @override
  void initState() {
    super.initState();
    if (_waits) {
      _timer = Timer.periodic(const Duration(seconds: 1), (t) {
        setState(() => _left = _left > 0 ? _left - 1 : 0);
        if (_left == 0) t.cancel();
      });
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final amount = formatPrice(widget.amountPaise);
    final p = widget.choice.provider ?? '';
    final (title, body, approve, decline) = switch (widget.choice.method) {
      'upi' => (
          'Approve the payment in your UPI app',
          widget.vpa != null
              ? 'A request for $amount went to ${widget.vpa} (demo). On a real payment you would approve it in your UPI app.'
              : 'On a real payment you would approve $amount in the UPI app you scanned with. Here, choose below (demo).',
          'Approve (demo)',
          'Decline (demo)'
        ),
      'card' => (
          'Bank OTP (demo)',
          'Your bank would text a one-time password to confirm $amount. The demo OTP is filled in.',
          'Submit',
          'Fail (demo)'
        ),
      'netbanking' => (
          '$p (demo) bank page',
          "This stands in for $p's login page. On a real payment you would sign in and confirm $amount. Nothing is sent to the bank.",
          'Success',
          'Failure'
        ),
      _ => ('$p wallet (demo)', 'Pay $amount from your $p wallet? Nothing is sent to $p.', 'Approve (demo)', 'Decline (demo)'),
    };
    final expired = _waits && _left == 0;
    final busy = widget.busy != null;
    Widget spinner(String which) => widget.busy == which
        ? const Padding(padding: EdgeInsets.only(right: 6), child: SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)))
        : const SizedBox.shrink();

    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      widget.heading(title),
      const SizedBox(height: 8),
      Text(body, style: const TextStyle(fontSize: 13)),
      if (widget.choice.method == 'card') ...[
        const SizedBox(height: 10),
        TextFormField(
          initialValue: demoOtp,
          readOnly: true,
          canRequestFocus: false,
          style: const TextStyle(letterSpacing: 4),
          decoration: InputDecoration(labelText: 'One-time password (OTP)', filled: true, fillColor: Colors.grey.shade100),
        ),
      ],
      if (_waits) ...[
        const SizedBox(height: 10),
        Text(expired ? 'This request has expired. No money was taken.' : 'Waiting for approval… ${formatCountdown(_left)} left',
            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
      ],
      const SizedBox(height: 12),
      if (expired)
        OutlinedButton(onPressed: widget.onRestart, child: const Text('Choose a way to pay again'))
      else
        Row(children: [
          Expanded(
            child: OutlinedButton(
              onPressed: busy ? null : () => widget.onAnswer(false),
              child: Row(mainAxisSize: MainAxisSize.min, children: [spinner('failure'), Flexible(child: Text(decline))]),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: ElevatedButton(
              onPressed: busy ? null : () => widget.onAnswer(true),
              child: Row(mainAxisSize: MainAxisSize.min, children: [spinner('success'), Flexible(child: Text(approve))]),
            ),
          ),
        ]),
    ]);
  }
}
