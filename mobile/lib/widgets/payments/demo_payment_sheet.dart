import 'package:flutter/material.dart';

import 'demo_payment_notice.dart';
import 'payment_method_tiles.dart';

/// The demo payment as a bottom sheet (e.g. a consultation fee on the trial
/// server). Returns the chosen method and whether to succeed, or null if closed.
Future<({String method, bool success})?> showDemoPaymentSheet(BuildContext context, {required String amountLabel, List<String> methods = const ['upi', 'card', 'netbanking', 'wallet']}) {
  return showModalBottomSheet<({String method, bool success})>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) {
      var method = methods.isEmpty ? 'upi' : methods.first;
      return StatefulBuilder(
        builder: (context, setState) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              const DemoPaymentNotice(),
              const SizedBox(height: 12),
              PaymentMethodTiles(methods: methods, selected: method, onSelect: (m) => setState(() => method = m)),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: () => Navigator.pop(sheet, (method: method, success: true)),
                child: Text('Pay $amountLabel (demo)'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(sheet, (method: method, success: false)),
                child: const Text('Simulate failure'),
              ),
            ]),
          ),
        ),
      );
    },
  );
}
