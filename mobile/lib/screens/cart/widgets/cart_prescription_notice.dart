import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../providers/prescription_provider.dart';
import '../../../utils/prescription_status.dart';

/// Shown when the server says the cart needs a prescription (C-08). Says
/// whether one is ready to choose at checkout, else offers the upload.
class CartPrescriptionNotice extends ConsumerWidget {
  const CartPrescriptionNotice({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final usable = (ref.watch(myPrescriptionsProvider).valueOrNull ?? const []).where(isUsableAtCheckout).length;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFAEEDA),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFF0C070)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.description_outlined, size: 20, color: Color(0xFF633806)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Prescription required',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: Color(0xFF633806))),
                const SizedBox(height: 2),
                // The pharmacist verifies it before dispatch (C-08)
                Text(
                    usable > 0
                        ? "You have $usable uploaded prescription${usable == 1 ? '' : 's'} — you'll pick it at checkout. Our pharmacist checks it before dispatch."
                        : 'Upload it now or at checkout. Our pharmacist checks it before dispatch.',
                    style: TextStyle(fontSize: 12, color: Colors.brown.shade600)),
                TextButton(
                  style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 32)),
                  onPressed: () => context.push('/account/prescriptions'),
                  child: Text(usable > 0 ? 'Upload another prescription' : 'Upload now'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
