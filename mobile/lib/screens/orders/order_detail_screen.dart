import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../services/api_service.dart';
import '../../config/theme.dart';
import '../../utils/formatters.dart';

final orderDetailProvider = FutureProvider.family<Map<String, dynamic>, String>((ref, id) async {
  final res = await apiService.dio.get('/orders/$id');
  return res.data['data'] as Map<String, dynamic>;
});

const _timelineSteps = [
  {'status': 'pending_payment', 'label': 'Order placed'},
  {'status': 'rx_pending',      'label': 'Prescription submitted'},
  {'status': 'rx_verified',     'label': 'Prescription verified'},
  {'status': 'packed',          'label': 'Order packed'},
  {'status': 'dispatched',      'label': 'Dispatched'},
  {'status': 'delivered',       'label': 'Delivered'},
];

const _statusOrder = [
  'pending_payment','rx_pending','rx_verified','packing','packed','dispatched','delivered'
];

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
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (order) {
          final status = order['status'] as String? ?? '';
          final currentIdx = _statusOrder.indexOf(status);
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

                // Timeline
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Order timeline',
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        const SizedBox(height: 14),
                        ...List.generate(_timelineSteps.length, (i) {
                          final step = _timelineSteps[i];
                          final stepIdx = _statusOrder.indexOf(step['status']!);
                          final done = currentIdx >= stepIdx && status != 'rx_rejected';
                          final active = _statusOrder[currentIdx] == step['status'];
                          final isLast = i == _timelineSteps.length - 1;
                          return Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Column(
                                children: [
                                  Container(
                                    width: 14, height: 14,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: done ? AppTheme.brandGreen : active ? Colors.white : Colors.grey.shade300,
                                      border: Border.all(
                                        color: done || active ? AppTheme.brandGreen : Colors.grey.shade300,
                                        width: active ? 2.5 : 1.5,
                                      ),
                                    ),
                                    child: done && !active
                                        ? const Icon(Icons.check, size: 9, color: Colors.white)
                                        : null,
                                  ),
                                  if (!isLast)
                                    Container(
                                      width: 2, height: 28,
                                      color: done ? AppTheme.brandGreen100 : Colors.grey.shade200,
                                    ),
                                ],
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Padding(
                                  padding: EdgeInsets.only(bottom: isLast ? 0 : 8),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(step['label']!,
                                        style: TextStyle(
                                          fontSize: 13,
                                          fontWeight: active ? FontWeight.w700 : FontWeight.normal,
                                          color: done ? Colors.grey.shade800 : Colors.grey.shade400,
                                        )),
                                      if (step['status'] == 'rx_pending' && active)
                                        Padding(
                                          padding: const EdgeInsets.only(top: 3),
                                          child: Text('Pharmacist will call you shortly',
                                            style: TextStyle(fontSize: 11, color: Colors.orange.shade700)),
                                        ),
                                      if (step['status'] == 'dispatched' && done && order['awb_number'] != null) ...[
                                        const SizedBox(height: 4),
                                        Text('${order['courier_partner']} · ${order['awb_number']}',
                                          style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                                        if (order['tracking_url'] != null)
                                          GestureDetector(
                                            onTap: () => launchUrl(Uri.parse(order['tracking_url'])),
                                            child: const Text('Track shipment →',
                                              style: TextStyle(fontSize: 11, color: AppTheme.brandGreen, fontWeight: FontWeight.w600)),
                                          ),
                                      ],
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          );
                        }),
                        if (status == 'rx_rejected')
                          Container(
                            margin: const EdgeInsets.only(top: 10),
                            padding: const EdgeInsets.all(10),
                            decoration: BoxDecoration(
                              color: Colors.red.shade50,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text('Prescription rejected. Order cancelled, refund initiated.',
                              style: TextStyle(fontSize: 12, color: Colors.red)),
                          ),
                      ],
                    ),
                  ),
                ),
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
