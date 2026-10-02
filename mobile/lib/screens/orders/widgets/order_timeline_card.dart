import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/theme.dart';
import 'order_timeline.dart';

/// "Order timeline" card. Handles every status, including cancelled,
/// rejected, failed, returned and statuses unknown to this app version.
class OrderTimelineCard extends StatelessWidget {
  final Map<String, dynamic> order;
  const OrderTimelineCard({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    final status = order['status']?.toString() ?? '';
    final view = timelineFor(status, requiresPrescription: order['requires_prescription'] != false);
    final steps = view.steps;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Order timeline', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(height: 14),
            for (var i = 0; i < steps.length; i++)
              _StepRow(
                step: steps[i],
                done: view.isDone(i),
                active: view.isActive(i),
                isLast: i == steps.length - 1,
                order: order,
              ),
            if (view.note != null)
              Container(
                margin: const EdgeInsets.only(top: 10),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(view.note!, style: const TextStyle(fontSize: 12, color: Colors.red)),
              ),
          ],
        ),
      ),
    );
  }
}

class _StepRow extends StatelessWidget {
  final TimelineStep step;
  final bool done, active, isLast;
  final Map<String, dynamic> order;

  const _StepRow({
    required this.step,
    required this.done,
    required this.active,
    required this.isLast,
    required this.order,
  });

  @override
  Widget build(BuildContext context) {
    final awb = order['awb_number'];
    final trackingUrl = order['tracking_url']?.toString();
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: 14,
              height: 14,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: done ? AppTheme.brandTeal : active ? Colors.white : Colors.grey.shade300,
                border: Border.all(
                  color: done || active ? AppTheme.brandTeal : Colors.grey.shade300,
                  width: active ? 2.5 : 1.5,
                ),
              ),
              child: done && !active ? const Icon(Icons.check, size: 9, color: Colors.white) : null,
            ),
            if (!isLast)
              Container(width: 2, height: 28, color: done ? AppTheme.brandTeal100 : Colors.grey.shade200),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(bottom: isLast ? 0 : 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(step.label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: active ? FontWeight.w700 : FontWeight.normal,
                      color: done ? Colors.grey.shade800 : Colors.grey.shade400,
                    )),
                if (step.status == 'rx_pending' && active)
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Text('Pharmacist will call you shortly',
                        style: TextStyle(fontSize: 11, color: Colors.orange.shade700)),
                  ),
                if (step.status == 'dispatched' && done && awb != null) ...[
                  const SizedBox(height: 4),
                  Text('${order['courier_partner'] ?? 'Courier'} · $awb',
                      style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                  if (trackingUrl != null && trackingUrl.isNotEmpty)
                    GestureDetector(
                      onTap: () {
                        final uri = Uri.tryParse(trackingUrl);
                        if (uri != null) launchUrl(uri);
                      },
                      child: const Text('Track shipment →',
                          style: TextStyle(fontSize: 11, color: AppTheme.brandTeal, fontWeight: FontWeight.w600)),
                    ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}
