import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../providers/product_page_providers.dart';

/// "Get it by <weekday, date>" for a PIN code (estimated), "Expires on or after
/// <Mon YYYY>" (C-27) and the cold-chain note (C-25). The PIN typed here lives in
/// this screen only; signed-in buyers get their saved address's PIN from the server.
class DeliveryInfoCard extends ConsumerStatefulWidget {
  final Map<String, dynamic> product;
  const DeliveryInfoCard({super.key, required this.product});

  @override
  ConsumerState<DeliveryInfoCard> createState() => _DeliveryInfoCardState();
}

class _DeliveryInfoCardState extends ConsumerState<DeliveryInfoCard> {
  String _pincode = '';
  bool _editing = false;
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final id = p['id']?.toString() ?? '';
    final canOrder = p['in_stock'] == true && p['cannot_order_online'] != true;
    final expiry = p['expires_on_or_after']?.toString();
    final coldNote = p['cold_chain_note']?.toString();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (canOrder) _eta(id),
        if (expiry != null && expiry.isNotEmpty)
          _line(Icons.event_available_outlined, 'Expires on or after $expiry', key: const ValueKey('expiry-line')),
        if (coldNote != null && coldNote.isNotEmpty)
          Container(
            key: const ValueKey('cold-chain-note'),
            margin: const EdgeInsets.only(top: 6),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(color: Colors.blue.shade50, borderRadius: BorderRadius.circular(8)),
            child: Row(children: [
              Icon(Icons.ac_unit, size: 16, color: Colors.blue.shade800),
              const SizedBox(width: 6),
              Expanded(child: Text(coldNote, style: TextStyle(fontSize: 13, color: Colors.blue.shade900))),
            ]),
          ),
      ],
    );
  }

  Widget _line(IconData icon, String text, {Key? key}) => Padding(
        key: key,
        padding: const EdgeInsets.only(top: 8),
        child: Row(children: [
          Icon(icon, size: 18, color: AppTheme.brandGreen),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 14))),
        ]),
      );

  Widget _eta(String id) {
    final async = ref.watch(deliveryEstimateProvider((id, _pincode)));
    final d = async.valueOrNull;
    if (_editing || d?.needsPincode == true) {
      return Padding(
        padding: const EdgeInsets.only(top: 8),
        child: Row(children: [
          Expanded(
            child: TextField(
              controller: _controller,
              keyboardType: TextInputType.number,
              maxLength: 6,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'PIN code for the delivery date', counterText: '', isDense: true),
            ),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            // the app theme makes outlined buttons full width; in a row it must size to its text
            style: OutlinedButton.styleFrom(minimumSize: const Size(64, 44)),
            onPressed: () {
              if (!RegExp(r'^[1-9]\d{5}$').hasMatch(_controller.text)) return;
              setState(() {
                _pincode = _controller.text;
                _editing = false;
              });
            },
            child: const Text('Check'),
          ),
        ]),
      );
    }
    if (d == null) return const SizedBox.shrink();
    return Padding(
      key: const ValueKey('delivery-eta'),
      padding: const EdgeInsets.only(top: 8),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.local_shipping_outlined, size: 18, color: AppTheme.brandGreen),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(d.label != null ? '${d.label} (estimated)' : (d.message ?? ''),
                style: TextStyle(fontSize: 14, fontWeight: d.label != null ? FontWeight.w600 : FontWeight.normal)),
            // Sprint 34: wraps on a small phone / large text instead of overflowing
            Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
              Text('To ${d.pincode ?? ''}${d.city != null ? ' (${d.city})' : ''}', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
              TextButton(
                style: TextButton.styleFrom(minimumSize: const Size(0, 28), padding: const EdgeInsets.symmetric(horizontal: 8)),
                onPressed: () => setState(() {
                  _controller.clear();
                  _editing = true;
                }),
                child: const Text('Change PIN'),
              ),
            ]),
          ]),
        ),
      ]),
    );
  }
}
