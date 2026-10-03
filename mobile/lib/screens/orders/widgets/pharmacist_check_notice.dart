import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../models/json_utils.dart';
import '../../../utils/pharmacist_check.dart';

/// "Checked by pharmacist <name>, Reg. no. <x>" with the time (C-08, C-46).
class CheckedByText extends StatelessWidget {
  final CheckedByLine line;
  const CheckedByText(this.line, {super.key});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 3),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Padding(
              padding: EdgeInsets.only(top: 1),
              child: Icon(Icons.how_to_reg_outlined, size: 14, color: AppTheme.brandLeafDark),
            ),
            const SizedBox(width: 4),
            Expanded(
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(text: line.text),
                  if (line.when != null)
                    TextSpan(text: ' · ${line.when}', style: TextStyle(color: AppTheme.muted(context))),
                ]),
                style: const TextStyle(fontSize: 11.5, color: AppTheme.brandLeafDark),
              ),
            ),
          ],
        ),
      );
}

/// The hold or refusal from the pharmacist check, in plain words for the buyer.
/// Shows nothing for any other state. A hold carries no reason for the buyer
/// (the server keeps the note for staff); the pharmacist will contact them, and
/// they can write to us about the order meanwhile (C-36). A refusal says the
/// order was cancelled and refunded (C-37), with the pharmacist's reason.
class PharmacistCheckNotice extends StatelessWidget {
  final Map<String, dynamic> order;
  const PharmacistCheckNotice({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    final status = asString(order['status']) ?? '';
    final check = orderCheckState(order);
    if (check == CheckState.held && status != 'cancelled') return _held(context);
    if (check == CheckState.rejected) return _rejected(context);
    return const SizedBox.shrink();
  }

  Widget _box({Key? key, required Color bg, required Color border, required List<Widget> children}) => Container(
        key: key,
        width: double.infinity,
        margin: const EdgeInsets.only(top: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: bg,
          border: Border.all(color: border),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
      );

  Widget _held(BuildContext context) {
    final id = asString(order['id']);
    final number = asString(order['order_number']);
    return _box(
      key: const ValueKey('check-held'),
      bg: AppTheme.amberBadge,
      border: const Color(0xFFF0D9A8),
      children: [
        const Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.pause_circle_outline, size: 18, color: AppTheme.amberText),
            SizedBox(width: 6),
            Expanded(
              child: Text(kHeldTitle,
                  style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: AppTheme.amberText)),
            ),
          ],
        ),
        const SizedBox(height: 4),
        const Text(kHeldText, style: TextStyle(fontSize: 12.5, height: 1.35, color: AppTheme.amberText)),
        if (id != null && id.isNotEmpty)
          TextButton.icon(
            style: TextButton.styleFrom(padding: EdgeInsets.zero, visualDensity: VisualDensity.compact),
            onPressed: () => context.push(Uri(
              path: '/account/complaints/new',
              queryParameters: {'orderId': id, if (number != null) 'orderNumber': number},
            ).toString()),
            icon: const Icon(Icons.chat_bubble_outline, size: 16),
            label: const Text('Write to us about this order', style: TextStyle(fontSize: 12.5)),
          ),
      ],
    );
  }

  Widget _rejected(BuildContext context) {
    final reason = refusalReason(order);
    final by = pharmacistLines(order, state: CheckState.rejected);
    final red = Colors.red.shade800;
    return _box(
      key: const ValueKey('check-rejected'),
      bg: Colors.red.shade50,
      border: Colors.red.shade200,
      children: [
        Text(kRejectedTitle, style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700, color: red)),
        const SizedBox(height: 4),
        Text(kRejectedText, style: TextStyle(fontSize: 12.5, height: 1.35, color: red)),
        if (reason != null) ...[
          const SizedBox(height: 4),
          Text('Reason: $reason', style: TextStyle(fontSize: 12.5, height: 1.35, color: red)),
        ],
        for (final l in by)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(l.when == null ? l.text : '${l.text} · ${l.when}',
                style: TextStyle(fontSize: 11.5, color: red)),
          ),
      ],
    );
  }
}
