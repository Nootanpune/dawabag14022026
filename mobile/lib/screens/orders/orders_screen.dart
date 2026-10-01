import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../services/api_service.dart';
import '../../providers/auth_provider.dart';
import '../../config/theme.dart';
import '../../utils/formatters.dart';
import '../../utils/ist.dart';

final ordersProvider = FutureProvider<List<dynamic>>((ref) async {
  final res = await apiService.dio.get('/orders/my?limit=20');
  return res.data['data']['orders'] as List;
});

const _statusColors = <String, Color>{
  'pending_payment':  Color(0xFFFAEEDA),
  'payment_failed':   Color(0xFFFCEBEB),
  'rx_pending':       Color(0xFFFFF3CD),
  'rx_verified':      Color(0xFFE6F1FB),
  'packing':          Color(0xFFEEEDFE),
  'packed':           Color(0xFFEEEDFE),
  'dispatched':       Color(0xFFEDFAF4),
  'delivered':        Color(0xFFEDFAF4),
  'cancelled':        Color(0xFFF1EFE8),
  'returned':         Color(0xFFF1EFE8),
};

const _statusTextColors = <String, Color>{
  'pending_payment':  Color(0xFF633806),
  'payment_failed':   Color(0xFF791F1F),
  'rx_pending':       Color(0xFF633806),
  'rx_verified':      Color(0xFF0C447C),
  'packing':          Color(0xFF3C3489),
  'packed':           Color(0xFF3C3489),
  'dispatched':       Color(0xFF0F5235),
  'delivered':        Color(0xFF0F5235),
  'cancelled':        Color(0xFF444441),
  'returned':         Color(0xFF444441),
};

const _statusLabels = <String, String>{
  'pending_payment':  'Awaiting payment',
  'payment_failed':   'Payment failed',
  'rx_pending':       'Rx verification pending',
  'rx_verified':      'Prescription verified',
  'packing':          'Being packed',
  'packed':           'Packed',
  'dispatched':       'Dispatched',
  'delivered':        'Delivered',
  'cancelled':        'Cancelled',
  'returned':         'Returned',
};

class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final orders = ref.watch(ordersProvider);

    if (!authState.isAuthenticated) {
      return Scaffold(
        appBar: AppBar(title: const Text('My orders')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.lock_outline, size: 48, color: Colors.grey),
              const SizedBox(height: 16),
              const Text('Login to view your orders',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
              const SizedBox(height: 24),
              SizedBox(
                width: 200,
                child: ElevatedButton(
                  onPressed: () => context.push('/auth/login'),
                  child: const Text('Sign in'),
                ),
              ),
            ],
          ),
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
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
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
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.receipt_long_outlined, size: 64, color: Colors.grey.shade300),
                  const SizedBox(height: 16),
                  Text('No orders yet',
                    style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16, color: Colors.grey.shade500)),
                  const SizedBox(height: 8),
                  Text('Your order history will appear here',
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
            );
          }

          return RefreshIndicator(
            color: AppTheme.brandGreen,
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
    final status = order['status'] as String? ?? '';
    final bgColor = _statusColors[status] ?? Colors.grey.shade100;
    final textColor = _statusTextColors[status] ?? Colors.grey.shade600;
    final label = _statusLabels[status] ?? status;

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
                Text(order['order_number'] ?? '',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: bgColor, borderRadius: BorderRadius.circular(20)),
                  child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: textColor)),
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
                Text('${order['item_count']} item${(order['item_count'] ?? 1) > 1 ? 's' : ''}',
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
                Text(formatPrice(order['total_paise'] ?? 0),
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              ],
            ),
            if (order['awb_number'] != null) ...[
              const SizedBox(height: 6),
              Text('${order['courier_partner']} · ${order['awb_number']}',
                style: const TextStyle(fontSize: 12, color: AppTheme.brandGreen)),
            ],
          ],
        ),
      ),
    );
  }
}
