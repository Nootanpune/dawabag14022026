import 'package:flutter/material.dart';

import '../config/theme.dart';

/// − qty + for a medicine in the server cart. At the minimum, − removes it.
class QuantityStepper extends StatelessWidget {
  final String name;
  final int quantity;
  final int min;
  final bool canIncrease;
  final bool busy;
  final VoidCallback onDecrease;
  final VoidCallback onIncrease;
  final bool compact;

  const QuantityStepper({
    super.key,
    required this.name,
    required this.quantity,
    this.min = 1,
    this.canIncrease = true,
    this.busy = false,
    required this.onDecrease,
    required this.onIncrease,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final atMin = quantity <= min;
    final size = compact ? 32.0 : 40.0;
    Widget button(IconData icon, String tip, VoidCallback? onTap) => SizedBox(
          width: size,
          height: size,
          child: IconButton(
            tooltip: tip,
            padding: EdgeInsets.zero,
            iconSize: compact ? 16 : 20,
            color: AppTheme.brandTeal700,
            onPressed: busy ? null : onTap,
            icon: Icon(icon),
          ),
        );
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: AppTheme.brandTeal, width: 1.5),
        borderRadius: BorderRadius.circular(8),
        color: Colors.white,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          button(atMin ? Icons.delete_outline : Icons.remove,
              atMin ? 'Remove $name from cart' : 'Decrease quantity of $name', onDecrease),
          SizedBox(
            width: compact ? 26 : 34,
            child: Semantics(
              label: '$quantity in cart',
              liveRegion: true,
              child: Text('$quantity',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: compact ? 13 : 15)),
            ),
          ),
          button(Icons.add, 'Increase quantity of $name', canIncrease ? onIncrease : null),
        ],
      ),
    );
  }
}
