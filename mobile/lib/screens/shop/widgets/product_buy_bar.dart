import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../providers/cart_actions.dart';
import '../../../providers/cart_provider.dart';
import '../../../utils/buyer_restriction.dart';
import '../../../utils/drug_schedule.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/cart_quantity_control.dart';

/// Product page bottom bar (Sprint 26): choose how many, then "Add N to cart";
/// once in the server cart, − qty + and "Go to cart".
class ProductBuyBar extends ConsumerStatefulWidget {
  final Map<String, dynamic> product;
  const ProductBuyBar({super.key, required this.product});

  @override
  ConsumerState<ProductBuyBar> createState() => _ProductBuyBarState();
}

class _ProductBuyBarState extends ConsumerState<ProductBuyBar> {
  int? _chosen;

  int get _min => ((widget.product['min_order_qty'] as num?)?.toInt() ?? 1).clamp(1, 9999);
  int get _max {
    final m = (widget.product['max_order_qty'] as num?)?.toInt() ?? (widget.product['max_qty_per_order'] as num?)?.toInt() ?? 99;
    return m < _min ? _min : m;
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final id = p['id']?.toString() ?? '';
    final cannotOrder = p['cannot_order_online'] == true || isNeverOnline(p['drug_schedule']?.toString());
    final inStock = p['in_stock'] == true;
    // Sprint 47: the server says this buyer may not buy it (missing field = allowed)
    final restricted = buyerMayNotBuy(p);
    final inCart = ref.watch(cartProvider.select((s) => s.view.lineFor(id)?.quantity ?? 0));
    final busy = ref.watch(cartProvider.select((s) => s.isUpdating));
    final qty = (_chosen ?? _min).clamp(_min, _max);
    final price = (p['price_paise'] as num?)?.toInt() ?? (p['offer_price_paise'] as num?)?.toInt() ?? 0;

    Widget body;
    if (restricted && inCart == 0 && !cannotOrder) {
      // No Add: the label instead (the page body explains who may buy it)
      body = ElevatedButton(
        key: const ValueKey('buy-bar-restricted'),
        onPressed: null,
        child: Text(buyerRestrictionLabel(p) ?? 'Not available to your account',
            maxLines: 2, textAlign: TextAlign.center, overflow: TextOverflow.ellipsis),
      );
    } else if (cannotOrder || !inStock) {
      body = ElevatedButton(onPressed: null, child: Text(cannotOrder ? 'Not available online' : 'Out of stock'));
    } else if (inCart > 0) {
      body = Row(children: [
        CartQuantityControl(product: p, compact: false),
        const SizedBox(width: 12),
        Expanded(
          child: ElevatedButton.icon(
            onPressed: () => context.push('/cart'),
            icon: const Icon(Icons.shopping_cart),
            label: const Text('Go to cart'),
          ),
        ),
      ]);
    } else {
      body = Row(children: [
        IconButton.outlined(
          tooltip: 'One less',
          onPressed: qty > _min ? () => setState(() => _chosen = qty - 1) : null,
          icon: const Icon(Icons.remove),
        ),
        SizedBox(
          width: 36,
          child: Text('$qty', textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        ),
        IconButton.outlined(
          tooltip: 'One more',
          onPressed: qty < _max ? () => setState(() => _chosen = qty + 1) : null,
          icon: const Icon(Icons.add),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: ElevatedButton(
            onPressed: busy ? null : () => addProductToCart(context, ref, p, quantity: qty),
            child: Text('Add $qty · ${formatPrice(price * qty)}', maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
        ),
      ]);
    }
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          body,
          if (inCart == 0 && inStock && !cannotOrder && !restricted)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text('Up to $_max per order', style: TextStyle(fontSize: 11, color: Colors.grey.shade700)),
            ),
        ]),
      ),
    );
  }
}
