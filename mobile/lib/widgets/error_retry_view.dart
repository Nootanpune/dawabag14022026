import 'package:flutter/material.dart';

/// Centred error message with a "Try again" button (server fetch failed).
class ErrorRetryView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const ErrorRetryView({super.key, required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              SizedBox(
                width: 160,
                child: OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
              ),
            ],
          ),
        ),
      );
}
