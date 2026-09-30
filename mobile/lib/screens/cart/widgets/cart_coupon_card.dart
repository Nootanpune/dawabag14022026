import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/cart_view.dart';
import '../../../utils/formatters.dart';

/// Coupon entry / applied coupon, backed by PUT /cart/coupon.
class CartCouponCard extends StatefulWidget {
  final CartCoupon? coupon;
  final bool busy;

  /// Returns an error message, or null when the server accepted the code.
  final Future<String?> Function(String code) onApply;
  final VoidCallback onRemove;

  const CartCouponCard({
    super.key,
    required this.coupon,
    required this.busy,
    required this.onApply,
    required this.onRemove,
  });

  @override
  State<CartCouponCard> createState() => _CartCouponCardState();
}

class _CartCouponCardState extends State<CartCouponCard> {
  final _ctrl = TextEditingController();
  bool _applying = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _apply() async {
    final code = _ctrl.text.trim().toUpperCase();
    if (code.isEmpty) return;
    setState(() => _applying = true);
    final error = await widget.onApply(code);
    if (!mounted) return;
    setState(() => _applying = false);
    final messenger = ScaffoldMessenger.of(context);
    if (error != null) {
      messenger.showSnackBar(SnackBar(content: Text(error), backgroundColor: Colors.red));
      return;
    }
    _ctrl.clear();
    messenger.showSnackBar(const SnackBar(
      content: Text('Coupon applied'),
      backgroundColor: AppTheme.brandGreen,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final coupon = widget.coupon;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Coupon / Referral code',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            const SizedBox(height: 10),
            if (coupon != null) _applied(coupon) else _entry(),
          ],
        ),
      ),
    );
  }

  Widget _applied(CartCoupon coupon) {
    final valid = coupon.valid;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: valid ? AppTheme.brandGreen50 : const Color(0xFFFDECEC),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: valid ? AppTheme.brandGreen100 : const Color(0xFFF5C2C2)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(coupon.code,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, color: AppTheme.brandGreen600)),
                Text(
                  valid
                      ? 'You save ${formatPrice(coupon.discountPaise)}'
                      : (coupon.message ?? 'This coupon does not apply to your cart'),
                  style: TextStyle(
                      fontSize: 12, color: valid ? AppTheme.brandGreen : AppTheme.errorRed),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: widget.busy ? null : widget.onRemove,
            child: const Text('Remove', style: TextStyle(color: Colors.red, fontSize: 13)),
          ),
        ],
      ),
    );
  }

  Widget _entry() {
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _ctrl,
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
          onPressed: (_applying || widget.busy) ? null : _apply,
          style: OutlinedButton.styleFrom(
            minimumSize: const Size(70, 42),
            padding: EdgeInsets.zero,
          ),
          child: _applying
              ? const SizedBox(
                  width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Apply'),
        ),
      ],
    );
  }
}
