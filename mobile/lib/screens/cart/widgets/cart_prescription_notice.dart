import 'package:flutter/material.dart';

/// Shown when the server says the cart needs a prescription.
class CartPrescriptionNotice extends StatelessWidget {
  const CartPrescriptionNotice({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFAEEDA),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFF0C070)),
      ),
      child: Row(
        children: [
          const Text('📋', style: TextStyle(fontSize: 18)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Prescription required',
                    style: TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 13, color: Color(0xFF633806))),
                const SizedBox(height: 2),
                Text("You'll upload your prescription during checkout.",
                    style: TextStyle(fontSize: 12, color: Colors.brown.shade600)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
