import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../models/json_utils.dart';
import '../../providers/order_detail_provider.dart';
import '../../services/api_service.dart';
import '../../utils/ist.dart';
import '../../widgets/error_retry_view.dart';
import 'widgets/cancel_order_button.dart';
import 'widgets/handover_code_card.dart';
import 'widgets/order_aftercare_card.dart';
import 'widgets/order_bill_card.dart';
import 'widgets/order_items_card.dart';
import 'widgets/order_shipments_card.dart';
import 'widgets/order_timeline_card.dart';
import 'widgets/refill_order_card.dart';

/// /orders/:id — everything comes from GET /orders/:id and is reloaded on
/// open, pull-to-refresh and after every action.
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
        data: (order) => RefreshIndicator(
          color: AppTheme.brandGreen,
          onRefresh: () => ref.refresh(orderDetailProvider(orderId).future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: _sections(context, order),
          ),
        ),
      ),
    );
  }

  List<Widget> _sections(BuildContext context, Map<String, dynamic> order) {
    final status = asString(order['status']) ?? '';
    final id = asString(order['id']) ?? orderId;
    final shipments = OrderShipmentsCard.fromOrder(order);
    const gap = SizedBox(height: 12);
    return [
      _Header(order: order, status: status),
      const SizedBox(height: 16),
      // Delivery code for the sealed pack, buyer only, while dispatched (C-26)
      if (HandoverCodeCard.withCode(shipments).isNotEmpty) ...[
        HandoverCodeCard(shipments: shipments),
        gap,
      ],
      // Timeline hides prescription steps when requires_prescription is false
      OrderTimelineCard(order: order),
      gap,
      OrderItemsCard(order: order),
      gap,
      // Seller, invoice PDF and "Report a problem" per shipment (C-05, C-33, C-37)
      if (shipments.isNotEmpty) ...[
        OrderShipmentsCard(shipments: shipments, orderId: id),
        gap,
      ],
      OrderBillCard(order: order),
      gap,
      // Refunds, credit notes and returns (C-37)
      OrderAftercareCard(order: order),
      if (status == 'delivered') ...[
        gap,
        RefillOrderCard(orderId: id),
      ],
      gap,
      if (asBool(order['can_cancel'])) ...[
        CancelOrderButton(orderId: id),
        const SizedBox(height: 8),
      ],
      // Complaint linked to this order (C-36)
      OutlinedButton.icon(
        onPressed: () => context.push(Uri(
          path: '/account/complaints/new',
          queryParameters: {
            'orderId': id,
            if (order['order_number'] != null) 'orderNumber': order['order_number'].toString(),
          },
        ).toString()),
        icon: const Icon(Icons.support_agent, size: 18),
        label: const Text('Raise a complaint about this order'),
      ),
      const SizedBox(height: 24),
    ];
  }
}

class _Header extends StatelessWidget {
  final Map<String, dynamic> order;
  final String status;
  const _Header({required this.order, required this.status});

  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(asString(order['order_number']) ?? '',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
                const SizedBox(height: 4),
                Text(formatDateIst(asString(order['created_at']) ?? ''),
                    style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: AppTheme.brandGreen50,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(status.replaceAll('_', ' '),
                style: const TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.brandGreen700)),
          ),
        ],
      );
}
