import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../config/theme.dart';
import '../../providers/delivery_offer_provider.dart';

/// "₹499" for whole rupees, "₹499.50" otherwise, Indian digit grouping ("₹5,000").
String rupeesShort(int paise) => NumberFormat.currency(
      locale: 'en_IN',
      symbol: '₹',
      decimalDigits: paise % 100 == 0 ? 0 : 2,
    ).format(paise / 100);

/// The home line, or null when free delivery is off.
String? freeDeliveryLine(int? abovePaise) =>
    abovePaise == null ? null : 'Free delivery on medicines of ${rupeesShort(abovePaise)} or more';

/// "Free delivery on medicines of ₹499 or more" under the home search, only when
/// the server says free delivery is on (amount from the owner's setting; nothing
/// hard-coded, nothing kept on the device). Shows nothing while loading or on error.
class FreeDeliveryNote extends ConsumerWidget {
  const FreeDeliveryNote({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final line = freeDeliveryLine(ref.watch(freeDeliveryAboveProvider).valueOrNull);
    if (line == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        children: [
          const Icon(Icons.local_shipping_outlined, size: 16, color: AppTheme.brandTeal700),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              line,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.brandTeal700),
            ),
          ),
        ],
      ),
    );
  }
}
