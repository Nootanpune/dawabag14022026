import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/sales_status_provider.dart';

/// Sprint 38 (the web's RxSalesBanner): when Dawabag pauses prescription-medicine
/// sales (emergency stop, owner decision 2026-10-03; C-08, C-46) the home screen,
/// prescription-medicine pages, cart and checkout say so plainly. The state comes
/// from GET /sales-status each time; [serverMessage] is the same server's text
/// when the screen already has it (the cart's `rx_sales_paused`).
/// Shows nothing while loading, on an error, or when sales are open.
class RxSalesBanner extends ConsumerWidget {
  final EdgeInsetsGeometry margin;
  final String? serverMessage;
  const RxSalesBanner({super.key, this.margin = EdgeInsets.zero, this.serverMessage});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(salesStatusProvider).valueOrNull;
    final message = (status != null && status.rxPaused) ? status.message : serverMessage;
    if (message == null || message.isEmpty) return const SizedBox.shrink();
    return Padding(padding: margin, child: RxSalesNotice(message: message));
  }
}

/// The banner itself, with the server's words (also used by the tests).
class RxSalesNotice extends StatelessWidget {
  final String message;
  const RxSalesNotice({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        key: const ValueKey('rx-sales-banner'),
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.amber.shade50,
          border: Border.all(color: Colors.amber.shade300),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.info_outline, size: 18, color: Colors.amber.shade900),
          const SizedBox(width: 8),
          Expanded(
            child: Text(message, style: TextStyle(fontSize: 13, height: 1.35, color: Colors.brown.shade900)),
          ),
        ]),
      ),
    );
  }
}
