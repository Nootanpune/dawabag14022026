import 'package:flutter/material.dart';

/// Full-width action button pinned under the checkout steps.
class CheckoutBottomButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool isLoading;

  const CheckoutBottomButton({
    super.key,
    required this.label,
    required this.onPressed,
    required this.isLoading,
  });

  @override
  Widget build(BuildContext context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: ElevatedButton(
            onPressed: isLoading ? null : onPressed,
            child: isLoading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                : Text(label),
          ),
        ),
      );
}
