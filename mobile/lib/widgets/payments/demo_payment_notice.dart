import 'package:flutter/material.dart';

/// "Demo payment — no money moves" (the owner's trial server, Sprint 26), shown
/// on every step of the demo checkout.
class DemoPaymentNotice extends StatelessWidget {
  const DemoPaymentNotice({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF8E6),
        border: Border.all(color: const Color(0xFFE0A526), width: 1.5),
        borderRadius: BorderRadius.circular(10),
      ),
      child: const Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.science_outlined, color: Color(0xFF7A4B00)),
        SizedBox(width: 8),
        Expanded(
          child: Text(
            'Demo payment — no money moves. This is the trial app, so real payment is switched off. '
            'The steps look like a real payment, but nothing is sent to a bank, card or wallet.',
            style: TextStyle(fontSize: 12, color: Color(0xFF7A4B00)),
          ),
        ),
      ]),
    );
  }
}
