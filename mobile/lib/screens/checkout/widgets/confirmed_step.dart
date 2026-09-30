import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class ConfirmedStep extends StatelessWidget {
  final String orderNumber;
  const ConfirmedStep({super.key, required this.orderNumber});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 40),
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(color: Colors.green.shade50, shape: BoxShape.circle),
          child: const Icon(Icons.check_circle, color: Colors.green, size: 40),
        ),
        const SizedBox(height: 20),
        const Text('Order confirmed!',
            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Text('Order ID: $orderNumber',
            style: TextStyle(fontSize: 14, color: Colors.grey.shade500)),
        const SizedBox(height: 8),
        Text("You'll receive SMS and email updates at every step.",
            style: TextStyle(fontSize: 13, color: Colors.grey.shade400),
            textAlign: TextAlign.center),
        const SizedBox(height: 32),
        ElevatedButton(
          onPressed: () => context.go('/orders'),
          child: const Text('Track my order'),
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: () => context.go('/'),
          child: const Text('Continue shopping'),
        ),
      ],
    );
  }
}
