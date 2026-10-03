import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/orders_provider.dart';
import '../../providers/auth_provider.dart';
import '../../config/theme.dart';
import '../../utils/formatters.dart';
import '../../utils/ist.dart';
import '../../utils/order_status.dart';
import '../../widgets/empty_state.dart';


class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final orders = ref.watch(ordersProvider);

    if (!authState.isAuthenticated) {
      return Scaffold(
        appBar: AppBar(title: const Text('My orders')),
        body: EmptyState(
          icon: Icons.receipt_long_outlined,
          title: 'Sign in to see your orders',
          hint: 'Track deliveries, download invoices and request returns.',
          actionLabel: 'Sign in',
          onAction: () => context.push('/auth/login'),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('My orders'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(ordersProvider),
          ),
        ],
      ),
      body: orders.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandTeal)),
        error: (err, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.grey),
              const SizedBox(height: 12),
              const Text('Failed to load orders'),
              TextButton(onPressed: () => ref.invalidate(ordersProvider), child: const Text('Retry')),
            ],
          ),
        ),
        data: (orderList) {
          if (orderList.isEmpty) {
            return EmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'No orders yet',
              hint: 'When you place an order, you can track it here, from pharmacist check to delivery.',
              actionLabel: 'Search medicines',
              onAction: () => context.go('/search'),
            );
          }

          return RefreshIndicator(
            color: AppTheme.brandTeal,
            onRefresh: () async => ref.invalidate(ordersProvider),
            child: ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: orderList.length,
              itemBuilder: (context, i) => _OrderCard(
                order: orderList[i],
                onTap: () => context.push('/orders/${orderList[i]['id']}'),
              ),
            ),
          );
        },
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  final Map order;
  final VoidCallback onTap;

  const _OrderCard({required this.order, required this.onTap});

  @override
  Widget build(BuildContext context) {
    // Same label as the order page, "Pharmacist check" included (Sprint 43)
    final info = orderStatusInfo(order);
    final bgColor = info.background;
    final textColor = info.foreground;
    final label = info.label;
    // Sprint 43: item_count counts only lines still to be supplied
    final count = (order['item_count'] is num) ? (order['item_count'] as num).toInt() : int.tryParse('${order['item_count']}') ?? 0;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: Colors.grey.shade200),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Flexible(
                  child: Text(order['order_number'] ?? '',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                ),
                const SizedBox(width: 8),
                Flexible(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(20)),
                    child: Text(label,
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: textColor)),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(formatDateIst(order['created_at'] ?? ''),
              style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('$count item${count == 1 ? '' : 's'}',
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
                Text(formatPrice(order['total_paise'] ?? 0),
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              ],
            ),
            if (order['awb_number'] != null) ...[
              const SizedBox(height: 6),
              Text('${order['courier_partner']} · ${order['awb_number']}',
                style: const TextStyle(fontSize: 12, color: AppTheme.brandTeal)),
            ],
          ],
        ),
      ),
    );
  }
}
