import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/cart_actions.dart';
import '../providers/cart_provider.dart';
import 'quantity_stepper.dart';

/// "Add" until the medicine is in the server cart, then − qty + (Sprint 26).
/// The cart is the server's; this only shows its quantity and changes it.
class CartQuantityControl extends ConsumerWidget {
  final Map<String, dynamic> product;
  final bool compact;
  const CartQuantityControl({super.key, required this.product, this.compact = false});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final id = product['id']?.toString() ?? '';
    final line = ref.watch(cartProvider.select((s) => s.view.lineFor(id)));
    final busy = ref.watch(cartProvider.select((s) => s.isUpdating));
    final inStock = product['in_stock'] as bool? ?? false;
    final name = product['name']?.toString() ?? 'this medicine';

    if (line != null && line.quantity > 0) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          QuantityStepper(
            name: name,
            quantity: line.quantity,
            min: line.minQty < 1 ? 1 : line.minQty,
            canIncrease: line.canIncrease,
            busy: busy,
            compact: compact,
            onDecrease: () => changeCartQuantity(context, ref, id,
                line.quantity <= (line.minQty < 1 ? 1 : line.minQty) ? 0 : line.quantity - 1),
            onIncrease: () => changeCartQuantity(context, ref, id, line.quantity + 1),
          ),
          if (!line.canIncrease && !compact)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                line.maxQty != null ? 'Up to ${line.maxQty} per order' : 'No more in stock',
                style: TextStyle(fontSize: 11, color: Colors.grey.shade700),
              ),
            ),
        ],
      );
    }
    if (!inStock) {
      return Text('Out of stock', style: TextStyle(fontSize: 12, color: Colors.grey.shade600));
    }
    return compact
        ? FilledButton.tonal(
            onPressed: busy ? null : () => addProductToCart(context, ref, product),
            style: FilledButton.styleFrom(minimumSize: const Size(64, 36)),
            child: const Text('Add'),
          )
        : SizedBox(
            width: double.infinity,
            height: 32,
            child: ElevatedButton(
              onPressed: busy ? null : () => addProductToCart(context, ref, product),
              style: ElevatedButton.styleFrom(
                padding: EdgeInsets.zero,
                minimumSize: Size.zero,
                textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              child: const Text('Add to cart'),
            ),
          );
  }
}
