import 'package:flutter/material.dart';

import '../config/theme.dart';

/// Friendly empty / signed-out / nothing-found view: icon, title, hint and an
/// optional action button. Used by cart, orders and search.
class EmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? hint;
  final String? actionLabel;
  final VoidCallback? onAction;

  const EmptyState({
    super.key,
    required this.icon,
    required this.title,
    this.hint,
    this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurfaceVariant;
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: const BoxDecoration(color: AppTheme.brandTeal50, shape: BoxShape.circle),
              child: Icon(icon, size: 34, color: AppTheme.brandTeal),
            ),
            const SizedBox(height: 16),
            Text(title,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
            if (hint != null) ...[
              const SizedBox(height: 6),
              Text(hint!, textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: muted)),
            ],
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: onAction,
                style: ElevatedButton.styleFrom(minimumSize: const Size(180, 44)),
                child: Text(actionLabel!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
