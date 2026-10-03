import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../models/json_utils.dart';
import '../../providers/order_detail_provider.dart';
import '../../services/api_service.dart';
import '../../utils/ist.dart';
import '../../utils/order_status.dart';
import '../../widgets/error_retry_view.dart';
import 'widgets/cancel_order_button.dart';
import 'widgets/edit/edit_order_card.dart';
import 'widgets/edit/extra_payment_card.dart';
import 'widgets/edit/order_edits_card.dart';
import 'widgets/handover_code_card.dart';
import 'widgets/order_aftercare_card.dart';
import 'widgets/order_bill_card.dart';
import 'widgets/order_items_card.dart';
import 'widgets/order_payment_card.dart';
import 'widgets/order_shipments_card.dart';
import 'widgets/order_timeline_card.dart';
import 'widgets/refill_order_card.dart';
import 'widgets/written_orders_card.dart';

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
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandTeal)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load this order'),
          onRetry: () => ref.invalidate(orderDetailProvider(orderId)),
        ),
        data: (order) => RefreshIndicator(
          color: AppTheme.brandTeal,
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
      _Header(order: order),
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
      // Sprint 44: the difference to pay for a change; the pharmacist approves once paid (C-37)
      if (ExtraPaymentCard.showsFor(order)) ...[
        ExtraPaymentCard(order: order),
        gap,
      ],
      // Sprint 44: change the order until the pharmacist approves it (invoice issued then), or why not
      if (EditOrderCard.showsFor(order)) ...[
        EditOrderCard(order: order),
        gap,
      ],
      if (OrderEditsCard.showsFor(order)) ...[
        OrderEditsCard(order: order),
        gap,
      ],
      // Sprint 44: a doctor / institution order's signed written order (r.65(9)(b))
      if (WrittenOrdersCard.showsFor(order)) ...[
        WrittenOrdersCard(order: order),
        gap,
      ],
      // Seller, invoice PDF and "Report a problem" per shipment (C-05, C-33, C-37)
      if (shipments.isNotEmpty) ...[
        OrderShipmentsCard(shipments: shipments, orderId: id),
        gap,
      ],
      OrderBillCard(order: order),
      gap,
      // Sprint 39: held until the pharmacist's check / charged / released (C-37)
      if (OrderPaymentCard.showsFor(order)) ...[
        OrderPaymentCard(order: order),
        gap,
      ],
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
  const _Header({required this.order});

  @override
  Widget build(BuildContext context) {
    // While the pharmacist check is open the chip says so (Sprint 36, C-08);
    // the same label as "My orders" (Sprint 43)
    final info = orderStatusInfo(order);
    return Row(
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
                // Sprint 44: "The tax invoice is issued when our pharmacist approves the order."
                if ((asString(order['invoice_note'])?.trim() ?? '').isNotEmpty)
                  Text(asString(order['invoice_note'])!.trim(),
                      key: const ValueKey('invoice-note'), style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
              ],
            ),
          ),
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: info.background,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(info.label,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w600, color: info.foreground)),
            ),
          ),
        ],
      );
  }
}
