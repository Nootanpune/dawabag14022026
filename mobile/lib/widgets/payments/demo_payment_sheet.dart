import 'package:flutter/material.dart';

import 'demo_checkout/demo_checkout.dart';

/// The demo checkout as a bottom sheet (e.g. a consultation fee on the trial
/// server). [onPay] records the answer on the server; the sheet closes with the
/// choice once paid, or with null when closed without paying.
Future<DemoChoice?> showDemoPaymentSheet(
  BuildContext context, {
  required int amountPaise,
  required DemoPay onPay,
  List<String> methods = const ['upi', 'card', 'netbanking', 'wallet'],
  Map<String, List<String>> providers = const {},
}) {
  return showModalBottomSheet<DemoChoice>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.viewInsetsOf(sheet).bottom),
        child: SingleChildScrollView(
          child: DemoCheckout(
            amountPaise: amountPaise,
            methods: methods,
            providers: providers,
            onPay: (choice, success) async {
              final paid = await onPay(choice, success);
              if (paid && sheet.mounted) Navigator.pop(sheet, choice);
              return paid;
            },
          ),
        ),
      ),
    ),
  );
}
