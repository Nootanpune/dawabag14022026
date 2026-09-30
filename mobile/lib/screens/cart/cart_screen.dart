import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/cart_provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../config/theme.dart';
import '../../utils/formatters.dart';

class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});

  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  final _couponCtrl = TextEditingController();
  bool _validatingCoupon = false;

  @override
  void dispose() { _couponCtrl.dispose(); super.dispose(); }

  Future<void> _applyCoupon() async {
    final code = _couponCtrl.text.trim().toUpperCase();
    if (code.isEmpty) return;
    setState(() => _validatingCoupon = true);
    try {
      final cart = ref.read(cartProvider);
      final res = await apiService.dio.post('/coupons/validate', data: {
        'code': code,
        'order_amount_paise': cart.subtotal,
      });
      final data = res.data['data'];
      ref.read(cartProvider.notifier).setCoupon(data['code'], data['discount_paise']);
      _couponCtrl.clear();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Coupon applied! Save ${formatPrice(data['discount_paise'])}'),
        backgroundColor: AppTheme.brandGreen,
      ));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text((e as dynamic).response?.data?['error'] ?? 'Invalid coupon'),
        backgroundColor: Colors.red,
      ));
    } finally {
      if (mounted) setState(() => _validatingCoupon = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider);
    final isAuth = ref.watch(authProvider).isAuthenticated;

    if (cart.items.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Cart')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.shopping_cart_outlined, size: 64, color: Colors.grey.shade300),
              const SizedBox(height: 16),
              Text('Your cart is empty',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: Colors.grey.shade500)),
              const SizedBox(height: 8),
              Text('Browse medicines and add them here',
                style: TextStyle(fontSize: 13, color: Colors.grey.shade400)),
              const SizedBox(height: 24),
              SizedBox(
                width: 180,
                child: ElevatedButton(
                  onPressed: () => context.go('/'),
                  child: const Text('Browse medicines'),
                ),
              ),
            ],
          ),
        ),
      );
    }

    const shippingPaise = 4900;
    final total = cart.subtotal + shippingPaise - cart.couponDiscountPaise;

    return Scaffold(
      appBar: AppBar(
        title: Text('Cart (${cart.itemCount})'),
        actions: [
          TextButton(
            onPressed: () => ref.read(cartProvider.notifier).clear(),
            child: const Text('Clear', style: TextStyle(color: Colors.red, fontSize: 13)),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Items
          ...cart.items.map((item) => _CartItemCard(
            item: item,
            onQtyChange: (q) => ref.read(cartProvider.notifier).updateQty(item.productId, q),
            onRemove: () => ref.read(cartProvider.notifier).removeItem(item.productId),
          )),
          const SizedBox(height: 12),

          // Prescription notice
          if (cart.requiresPrescription)
            Container(
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
                          style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: Color(0xFF633806))),
                        const SizedBox(height: 2),
                        Text('You\'ll upload your prescription during checkout.',
                          style: TextStyle(fontSize: 12, color: Colors.brown.shade600)),
                      ],
                    ),
                  ),
                ],
              ),
            ),

          // Coupon
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Coupon / Referral code',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  const SizedBox(height: 10),
                  if (cart.couponCode != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: AppTheme.brandGreen50,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: AppTheme.brandGreen100),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(cart.couponCode!,
                                  style: const TextStyle(fontWeight: FontWeight.w700, color: AppTheme.brandGreen600)),
                                Text('You save ${formatPrice(cart.couponDiscountPaise)}',
                                  style: const TextStyle(fontSize: 12, color: AppTheme.brandGreen)),
                              ],
                            ),
                          ),
                          TextButton(
                            onPressed: () => ref.read(cartProvider.notifier).removeCoupon(),
                            child: const Text('Remove', style: TextStyle(color: Colors.red, fontSize: 13)),
                          ),
                        ],
                      ),
                    )
                  else
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _couponCtrl,
                            textCapitalization: TextCapitalization.characters,
                            decoration: const InputDecoration(
                              hintText: 'Enter code',
                              contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              isDense: true,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          onPressed: _validatingCoupon ? null : _applyCoupon,
                          style: OutlinedButton.styleFrom(
                            minimumSize: const Size(70, 42),
                            padding: EdgeInsets.zero,
                          ),
                          child: _validatingCoupon
                              ? const SizedBox(width: 16, height: 16,
                                  child: CircularProgressIndicator(strokeWidth: 2))
                              : const Text('Apply'),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // Summary
          Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                children: [
                  _SummaryRow('Subtotal (${cart.itemCount} items)', formatPrice(cart.subtotal)),
                  const SizedBox(height: 8),
                  _SummaryRow('Shipping', formatPrice(shippingPaise)),
                  if (cart.couponDiscountPaise > 0) ...[
                    const SizedBox(height: 8),
                    _SummaryRow('Discount (${cart.couponCode})',
                      '–${formatPrice(cart.couponDiscountPaise)}', valueColor: Colors.green),
                  ],
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 10),
                    child: Divider(height: 1),
                  ),
                  _SummaryRow('Total payable', formatPrice(total),
                    bold: true, valueColor: AppTheme.brandGreen600),
                  const SizedBox(height: 4),
                  Text('Incl. all taxes (GST)',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 80),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: ElevatedButton(
            onPressed: () {
              if (!isAuth) {
                context.push('/auth/login');
                return;
              }
              context.push('/checkout');
            },
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text('Proceed to checkout'),
                const SizedBox(width: 8),
                const Icon(Icons.arrow_forward, size: 18),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CartItemCard extends StatelessWidget {
  final CartItem item;
  final void Function(int) onQtyChange;
  final VoidCallback onRemove;

  const _CartItemCard({required this.item, required this.onQtyChange, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Container(
              width: 52, height: 52,
              decoration: BoxDecoration(
                color: AppTheme.brandGreen50,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Center(child: Text('💊', style: TextStyle(fontSize: 22))),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.name,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                    maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 2),
                  Text(item.sku, style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      // Qty controls
                      _QtyButton(
                        icon: Icons.remove,
                        onTap: () => onQtyChange(item.quantity - 1),
                        enabled: item.quantity > 1,
                      ),
                      Container(
                        width: 32,
                        alignment: Alignment.center,
                        child: Text('${item.quantity}',
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                      ),
                      _QtyButton(
                        icon: Icons.add,
                        onTap: () => onQtyChange(item.quantity + 1),
                        enabled: item.quantity < item.maxQty,
                      ),
                      const Spacer(),
                      Text(formatPrice(item.lineTotalPaise),
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: AppTheme.brandGreen600)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 4),
            IconButton(
              icon: const Icon(Icons.delete_outline, color: Colors.red, size: 20),
              onPressed: onRemove,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(),
            ),
          ],
        ),
      ),
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
      width: 28, height: 28,
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade300),
        borderRadius: BorderRadius.circular(6),
        color: enabled ? Colors.white : Colors.grey.shade100,
      ),
      child: Icon(icon, size: 14, color: enabled ? Colors.grey.shade700 : Colors.grey.shade300),
    ),
  );
}

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;
  final Color? valueColor;

  const _SummaryRow(this.label, this.value, {this.bold = false, this.valueColor});

  @override
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(label, style: TextStyle(
        fontSize: bold ? 15 : 13,
        fontWeight: bold ? FontWeight.w700 : FontWeight.normal,
        color: bold ? null : Colors.grey.shade600,
      )),
      Text(value, style: TextStyle(
        fontSize: bold ? 16 : 13,
        fontWeight: bold ? FontWeight.w700 : FontWeight.normal,
        color: valueColor,
      )),
    ],
  );
}
