import 'package:flutter/material.dart';

import '../../config/theme.dart';

/// Explains the existing prescription flow before sending the user into it:
/// the photo is attached to an order at checkout (prescription step) and a
/// pharmacist verifies it before dispatch (C-08). No new upload path.
Future<void> showPrescriptionStepsSheet(
  BuildContext context, {
  required bool cartHasItems,
  required VoidCallback onGoToCart,
  required VoidCallback onSearch,
}) {
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (sheetContext) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Ordering with a prescription',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            const _Step(n: 1, text: 'Add the prescribed medicines to your cart.'),
            const _Step(n: 2, text: 'At checkout, take a photo of the prescription or pick one from your gallery.'),
            const _Step(n: 3, text: 'A registered pharmacist checks it before your order is dispatched.'),
            const SizedBox(height: 12),
            ElevatedButton(
              onPressed: () {
                Navigator.pop(sheetContext);
                cartHasItems ? onGoToCart() : onSearch();
              },
              child: Text(cartHasItems ? 'Go to cart and checkout' : 'Find my medicines'),
            ),
          ],
        ),
      ),
    ),
  );
}

class _Step extends StatelessWidget {
  final int n;
  final String text;
  const _Step({required this.n, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          CircleAvatar(
            radius: 12,
            backgroundColor: AppTheme.brandGreen50,
            child: Text('$n',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.brandGreen700)),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 14, height: 1.35))),
        ],
      ),
    );
  }
}
