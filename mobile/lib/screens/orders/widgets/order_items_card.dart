import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../models/json_utils.dart';
import '../../../utils/formatters.dart';

/// "Items ordered", with "Report a side effect" per line (C-29).
class OrderItemsCard extends StatelessWidget {
  final Map<String, dynamic> order;
  const OrderItemsCard({super.key, required this.order});

  void _reportSideEffect(BuildContext context, Map<String, dynamic> item) {
    final productId = asString(item['product_id']) ?? '';
    if (productId.isEmpty) return;
    context.push(Uri(
      path: '/account/side-effects/new',
      queryParameters: {
        'productId': productId,
        if (item['product_name'] != null) 'productName': item['product_name'].toString(),
        if (order['id'] != null) 'orderId': order['id'].toString(),
      },
    ).toString());
  }

  @override
  Widget build(BuildContext context) {
    final items = asMapList(order['items']);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Items ordered', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(height: 12),
            ...items.map((item) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 40,
                        height: 40,
                        decoration: BoxDecoration(
                          color: AppTheme.brandGreen50,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: const Icon(Icons.medication_outlined, color: AppTheme.brandGreen, size: 20),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(asString(item['product_name']) ?? '',
                                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis),
                            Text(
                              [
                                if (item['sku'] != null) '${item['sku']}',
                                'Qty: ${asInt(item['quantity'])}',
                              ].join(' · '),
                              style: TextStyle(fontSize: 11, color: Colors.grey.shade500),
                            ),
                            InkWell(
                              onTap: () => _reportSideEffect(context, item),
                              child: Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text('Report a side effect',
                                    style: TextStyle(
                                        fontSize: 11,
                                        color: Colors.orange.shade800,
                                        fontWeight: FontWeight.w600)),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(formatPrice(asInt(item['line_total_paise'])),
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                    ],
                  ),
                )),
          ],
        ),
      ),
    );
  }
}
