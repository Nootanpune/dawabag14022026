import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/cart_view.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/product_image.dart';

/// One server cart line: server prices, quantity controls and any `issue`.
class CartLineCard extends StatelessWidget {
  final CartLine line;
  final bool busy;
  final void Function(int quantity) onQuantityChange;
  final VoidCallback onRemove;

  const CartLineCard({
    super.key,
    required this.line,
    required this.busy,
    required this.onQuantityChange,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final issue = line.issue;
    final unavailable = !line.available;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                ProductImage(
                  name: line.name,
                  imageUrl: ProductImage.imageUrlOf({'image_url': line.imageUrl}),
                  width: 52,
                  height: 52,
                  compact: true,
                  borderRadius: BorderRadius.circular(10),
                ),
                const SizedBox(width: 12),
                Expanded(child: _details()),
                const SizedBox(width: 4),
                IconButton(
                  icon: const Icon(Icons.delete_outline, color: Colors.red, size: 20),
                  onPressed: busy ? null : onRemove,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ],
            ),
            if (issue != null || unavailable) ...[
              const SizedBox(height: 8),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: const Color(0xFFFDECEC),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  issue ?? 'Currently unavailable',
                  style: const TextStyle(fontSize: 12, color: AppTheme.errorRed),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _details() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(line.name,
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
            maxLines: 2,
            overflow: TextOverflow.ellipsis),
        const SizedBox(height: 2),
        Row(
          children: [
            if (line.sku != null)
              Text(line.sku!, style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
            if (line.requiresPrescription) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: AppTheme.amberBadge,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text('Rx',
                    style: TextStyle(
                        fontSize: 10, fontWeight: FontWeight.w700, color: AppTheme.amberText)),
              ),
            ],
          ],
        ),
        const SizedBox(height: 2),
        Text('${formatPrice(line.unitPricePaise)} each'
            '${line.mrpPaise > line.unitPricePaise ? ' · MRP ${formatPrice(line.mrpPaise)}' : ''}',
            style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
        const SizedBox(height: 6),
        Row(
          children: [
            _QtyButton(
              icon: Icons.remove,
              enabled: !busy && line.quantity > line.minQty,
              onTap: () => onQuantityChange(line.quantity - 1),
            ),
            Container(
              width: 32,
              alignment: Alignment.center,
              child: Text('${line.quantity}',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            ),
            _QtyButton(
              icon: Icons.add,
              enabled: !busy && line.canIncrease,
              onTap: () => onQuantityChange(line.quantity + 1),
            ),
            const Spacer(),
            Text(formatPrice(line.lineSubtotalPaise),
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 14, color: AppTheme.brandGreen600)),
          ],
        ),
      ],
    );
  }
}

class _QtyButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool enabled;

  const _QtyButton({required this.icon, required this.onTap, required this.enabled});

  @override
  Widget build(BuildContext context) => GestureDetector(
        onTap: enabled ? onTap : null,
        child: Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            border: Border.all(color: Colors.grey.shade300),
            borderRadius: BorderRadius.circular(6),
            color: enabled ? Colors.white : Colors.grey.shade100,
          ),
          child: Icon(icon,
              size: 14, color: enabled ? Colors.grey.shade700 : Colors.grey.shade300),
        ),
      );
}
