import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../services/api_service.dart';
import '../../config/theme.dart';
import '../../utils/formatters.dart';
import '../../widgets/error_retry_view.dart';
import 'widgets/order_shipments_card.dart';
import 'widgets/order_timeline_card.dart';
import 'widgets/refill_order_card.dart';

final orderDetailProvider = FutureProvider.family<Map<String, dynamic>, String>((ref, id) async {
  final res = await apiService.dio.get('/orders/$id');
  return res.data['data'] as Map<String, dynamic>;
});

class OrderDetailScreen extends ConsumerWidget {
  final String orderId;
  const OrderDetailScreen({super.key, required this.orderId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orderAsync = ref.watch(orderDetailProvider(orderId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Order details'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(orderDetailProvider(orderId)),
          ),
        ],
      ),
      body: orderAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load this order'),
          onRetry: () => ref.invalidate(orderDetailProvider(orderId)),
        ),
        data: (order) {
          final status = order['status'] as String? ?? '';
          return RefreshIndicator(
            color: AppTheme.brandGreen,
            onRefresh: () async => ref.invalidate(orderDetailProvider(orderId)),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Header
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(order['order_number'] ?? '',
                          style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
                        const SizedBox(height: 4),
                        Text(formatDate(order['created_at'] ?? ''),
                          style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
                      ],
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: AppTheme.brandGreen50,
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(status.replaceAll('_', ' '),
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.brandGreen700)),
                    ),
                  ],
                ),
                const SizedBox(height: 20),

                // Timeline — handles every status, incl. rx_rejected,
                // cancelled, returned, payment_failed, confirmed and unknown ones.
                OrderTimelineCard(order: order),
                const SizedBox(height: 12),

                // Items
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Items ordered',
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        const SizedBox(height: 12),
                        ...((order['items'] as List?) ?? []).map((item) => Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Row(
                            children: [
                              Container(
                                width: 40, height: 40,
                                decoration: BoxDecoration(
                                  color: AppTheme.brandGreen50,
                                  borderRadius: BorderRadius.circular(8),
                                ),
                                child: const Center(child: Text('💊', style: TextStyle(fontSize: 18))),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(item['product_name'] ?? '',
                                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                                      maxLines: 2, overflow: TextOverflow.ellipsis),
                                    Text('${item['sku']} · Qty: ${item['quantity']}',
                                      style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                                  ],
                                ),
                              ),
                              Text(formatPrice(item['line_total_paise'] ?? 0),
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                            ],
                          ),
                        )),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),

                // Seller + invoice per shipment, only when the API sent them
                if (OrderShipmentsCard.fromOrder(order).isNotEmpty) ...[
                  // Invoice number per seller + where to get the PDF (C-05, C-33)
                  OrderShipmentsCard(
                    shipments: OrderShipmentsCard.fromOrder(order),
                    showInvoiceNote: true,
                  ),
                  const SizedBox(height: 12),
                ],

                // Bill summary
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Bill summary',
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        const SizedBox(height: 10),
                        _BillRow('Subtotal', formatPrice(order['subtotal_paise'] ?? 0)),
                        const SizedBox(height: 6),
                        _BillRow('Shipping', formatPrice(order['shipping_paise'] ?? 0)),
                        if ((order['discount_paise'] ?? 0) > 0) ...[
                          const SizedBox(height: 6),
                          _BillRow('Discount', '–${formatPrice(order['discount_paise'])}', color: Colors.green),
                        ],
                        const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider()),
                        _BillRow('Total paid', formatPrice(order['total_paise'] ?? 0),
                          bold: true, color: AppTheme.brandGreen600),
                        if (order['payment_method'] != null) ...[
                          const SizedBox(height: 6),
                          Text('Paid via ${order['payment_method']}',
                            style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
                        ],
                      ],
                    ),
                  ),
                ),
                if (status == 'delivered') ...[
                  const SizedBox(height: 12),
                  RefillOrderCard(orderId: order['id']?.toString() ?? orderId),
                ],
                const SizedBox(height: 12),
                // Complaint linked to this order (C-36)
                OutlinedButton.icon(
                  onPressed: () => context.push(Uri(
                    path: '/account/complaints/new',
                    queryParameters: {
                      'orderId': order['id']?.toString() ?? orderId,
                      if (order['order_number'] != null) 'orderNumber': order['order_number'].toString(),
                    },
                  ).toString()),
                  icon: const Icon(Icons.support_agent, size: 18),
                  label: const Text('Report a problem with this order'),
                ),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _BillRow extends StatelessWidget {
  final String label, value;
  final bool bold;
  final Color? color;
  const _BillRow(this.label, this.value, {this.bold = false, this.color});

  @override
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(label, style: TextStyle(fontSize: bold ? 15 : 13, fontWeight: bold ? FontWeight.w700 : FontWeight.normal, color: bold ? null : Colors.grey.shade600)),
      Text(value, style: TextStyle(fontSize: bold ? 15 : 13, fontWeight: bold ? FontWeight.w700 : FontWeight.normal, color: color)),
    ],
  );
}
