import 'package:flutter/material.dart';

import '../../../config/theme.dart';

/// Horizontal step indicator for checkout.
class CheckoutStepBar extends StatelessWidget {
  final List<String> steps;
  final int currentIndex;

  const CheckoutStepBar({super.key, required this.steps, required this.currentIndex});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      color: Colors.white,
      child: Row(
        children: List.generate(steps.length * 2 - 1, (i) {
          if (i.isOdd) {
            final done = currentIndex > i ~/ 2;
            return Expanded(
              child: Container(
                  height: 1.5, color: done ? AppTheme.brandGreen : Colors.grey.shade200),
            );
          }
          final si = i ~/ 2;
          final done = currentIndex > si;
          final active = currentIndex == si;
          return Row(
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: (done || active) ? AppTheme.brandGreen : Colors.grey.shade200,
                  border: active ? Border.all(color: AppTheme.brandGreen, width: 2) : null,
                ),
                child: Center(
                  child: done
                      ? const Icon(Icons.check, size: 12, color: Colors.white)
                      : Text('${si + 1}',
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: active ? Colors.white : Colors.grey.shade500)),
                ),
              ),
              const SizedBox(width: 6),
              Text(steps[si],
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: active ? FontWeight.w700 : FontWeight.normal,
                    color: active
                        ? AppTheme.brandGreen600
                        : done
                            ? AppTheme.brandGreen
                            : Colors.grey,
                  )),
            ],
          );
        }),
      ),
    );
  }
}
