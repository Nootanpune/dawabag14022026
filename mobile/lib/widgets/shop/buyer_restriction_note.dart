import 'package:flutter/material.dart';

import '../../utils/buyer_restriction.dart';

/// Sprint 47: "Supplied only to doctors and hospitals" / "… licensed trade
/// buyers" on a restricted product (search, product page, substitutes, cards),
/// shown to every viewer. [detail] (product page) adds who may buy it and, for a
/// buyer who may not, that it cannot be added. Nothing for an unrestricted
/// product, or from an older server without the fields.
class BuyerRestrictionNote extends StatelessWidget {
  final Map<String, dynamic> product;
  final bool detail;
  final EdgeInsetsGeometry margin;

  const BuyerRestrictionNote({super.key, required this.product, this.detail = false, this.margin = EdgeInsets.zero});

  @override
  Widget build(BuildContext context) {
    final label = buyerRestrictionLabel(product);
    if (label == null) return const SizedBox.shrink();
    final blocked = buyerMayNotBuy(product);
    final why = detail ? buyerRestrictionExplanation(product['buyer_restriction']?.toString()) : null;
    final fg = blocked ? const Color(0xFF78350F) : const Color(0xFF0C4A6E);
    return Container(
      key: const ValueKey('buyer-restriction-note'),
      margin: margin,
      padding: EdgeInsets.symmetric(horizontal: detail ? 10 : 8, vertical: detail ? 8 : 4),
      decoration: BoxDecoration(
        color: blocked ? const Color(0xFFFFFBEB) : const Color(0xFFF0F9FF),
        border: Border.all(color: blocked ? const Color(0xFFFCD34D) : const Color(0xFFBAE6FD)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.verified_user_outlined, size: detail ? 16 : 13, color: fg),
            const SizedBox(width: 4),
            Flexible(
              child: Text(label,
                  maxLines: detail ? null : 2,
                  overflow: detail ? null : TextOverflow.ellipsis,
                  style: TextStyle(fontSize: detail ? 13 : 11, fontWeight: FontWeight.w600, color: fg)),
            ),
          ]),
          if (why != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(why, style: TextStyle(fontSize: 12, color: fg)),
            ),
          if (detail && blocked)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(kBuyerRestrictedCannotAdd, style: TextStyle(fontSize: 12, color: fg)),
            ),
        ],
      ),
    );
  }
}

/// In place of Add for a buyer who may not buy it (the label, never a button).
class BuyerRestrictedLabel extends StatelessWidget {
  final String label;
  final double? height;
  const BuyerRestrictedLabel({super.key, required this.label, this.height});

  @override
  Widget build(BuildContext context) => Container(
        key: const ValueKey('buyer-restricted'),
        width: double.infinity,
        height: height,
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: const Color(0xFFFFFBEB),
          border: Border.all(color: const Color(0xFFFDE68A)),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(label,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: Color(0xFF78350F))),
      );
}
