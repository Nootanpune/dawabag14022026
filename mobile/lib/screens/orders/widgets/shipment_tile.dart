import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../models/json_utils.dart';
import '../../../models/shipment_tracking.dart';
import '../../../services/api_service.dart';
import '../../../services/invoice_api.dart';
import '../../../utils/formatters.dart';
import '../../../utils/pharmacist_check.dart';
import '../../../widgets/open_pdf_button.dart';
import 'pharmacist_check_notice.dart';
import 'tracking_timeline.dart';

/// One shipment: seller, tax invoice, status, seal number and who received
/// it. With [orderId] it offers the invoice PDF (signed link, C-33) and,
/// once delivered, "Report a problem" (C-37).
class ShipmentTile extends StatelessWidget {
  final Map<String, dynamic> shipment;
  final String sellerLabel;
  final String? orderId;

  const ShipmentTile({
    super.key,
    required this.shipment,
    required this.sellerLabel,
    this.orderId,
  });

  String? _text(String key) {
    final v = shipment[key];
    if (v == null) return null;
    final s = v.toString().trim();
    return s.isEmpty ? null : s;
  }

  @override
  Widget build(BuildContext context) {
    final id = _text('id') ?? '';
    final invoice = _text('invoice_number');
    final status = _text('status');
    final seal = _text('seal_number');
    final receivedBy = _text('received_by_name');
    final relation = _text('received_by_relation');
    final total = shipment['total_paise'];
    final detailed = orderId != null && id.isNotEmpty;
    final tracking = ShipmentTracking.fromShipment(shipment);
    final grey = TextStyle(fontSize: 11, color: Colors.grey.shade600);
    // Sprint 36: who checked this shipment before packing, or where the check stands (C-08)
    final checkedBy = pharmacistLineFor(shipment);
    final checkNote = shipmentCheckNote(shipment);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.local_shipping_outlined, size: 18, color: Colors.grey.shade600),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(sellerLabel, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  if (invoice != null) Text('Tax invoice $invoice', style: grey),
                  if (detailed && status != null) Text('Status: ${status.replaceAll('_', ' ')}', style: grey),
                  if (checkedBy != null) CheckedByText(checkedBy),
                  if (checkNote != null)
                    Text(checkNote,
                        style: grey.copyWith(
                            color: shipment['pharmacist_check'] == CheckState.held ? AppTheme.amberText : null,
                            fontWeight: shipment['pharmacist_check'] == CheckState.held ? FontWeight.w600 : null)),
                  // Tamper-evident seal on the pack (C-26)
                  if (seal != null) Text('Seal no. $seal', style: grey),
                  if (receivedBy != null)
                    Text('Received by $receivedBy${relation != null ? ' ($relation)' : ''}', style: grey),
                ],
              ),
            ),
            if (total != null)
              Text(formatPrice(asInt(total)),
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ],
        ),
        // Courier tracking timeline (Sprint 8), order detail only
        if (detailed && tracking.hasData)
          Padding(
            padding: const EdgeInsets.only(left: 28, top: 8, bottom: 4),
            child: TrackingTimeline(tracking: tracking),
          ),
        if (detailed)
          Padding(
            padding: const EdgeInsets.only(left: 20),
            child: Wrap(
              spacing: 4,
              children: [
                if (invoice != null)
                  OpenPdfButton(
                    label: 'View invoice',
                    resolve: () => apiService.shipmentInvoiceUri(id),
                  ),
                if (status == 'delivered')
                  TextButton.icon(
                    onPressed: () => context.push(Uri(
                      path: '/account/returns/new',
                      queryParameters: {'orderId': orderId!, 'shipmentId': id},
                    ).toString()),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      visualDensity: VisualDensity.compact,
                    ),
                    icon: const Icon(Icons.assignment_return_outlined, size: 16),
                    label: const Text('Report a problem', style: TextStyle(fontSize: 12)),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}
