import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/trade_prices.dart';
import '../providers/trade_price_provider.dart';

/// Sprint 34 (the web's TradePriceBanner): on search, product, cart and checkout
/// a retailer / wholesaler whose drug licence has lapsed is told why the prices
/// are retail, with a link to Your drug licences to send the renewal (C-14).
/// Shows nothing while loading, on an error, or when prices are not paused.
class TradePriceBanner extends ConsumerWidget {
  final EdgeInsetsGeometry margin;
  const TradePriceBanner({super.key, this.margin = EdgeInsets.zero});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(tradePricesProvider).valueOrNull;
    if (status == null || !status.showBanner) return const SizedBox.shrink();
    return Padding(padding: margin, child: TradePriceNotice(licence: status.licence!));
  }
}

/// The banner itself, from the server's answer (also used by the tests).
class TradePriceNotice extends StatelessWidget {
  final TradePause licence;
  const TradePriceNotice({super.key, required this.licence});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        key: const ValueKey('trade-price-banner'),
        width: double.infinity,
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.amber.shade50,
          border: Border.all(color: Colors.amber.shade200),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.warning_amber_rounded, size: 18, color: Colors.amber.shade800),
          const SizedBox(width: 8),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('${tradePauseText(licence)}.', style: TextStyle(fontSize: 13, color: Colors.brown.shade900)),
              TextButton(
                style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 36)),
                onPressed: () => context.push('/account/licences'),
                child: const Text('Send the renewed licence', style: TextStyle(decoration: TextDecoration.underline)),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}
