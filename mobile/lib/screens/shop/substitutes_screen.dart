import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/theme.dart';
import '../../providers/product_page_providers.dart';
import '../../services/api_service.dart';
import '../../widgets/error_retry_view.dart';
import 'widgets/substitutes_section.dart';

/// Every substitute for a medicine (Sprint 33): same composition, strength, form,
/// release type, route and a comparable pack; cheapest per unit first. A list
/// only — nothing is swapped (C-08).
class SubstitutesScreen extends ConsumerWidget {
  final String productId;
  const SubstitutesScreen({super.key, required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(substitutesProvider((productId, null)));
    return Scaffold(
      appBar: AppBar(title: const Text('Substitutes')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandTeal)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load the substitutes'),
          onRetry: () => ref.invalidate(substitutesProvider((productId, null))),
        ),
        data: (r) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Substitutes for ${r.productName}', style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            if (r.total == 0)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Text('No substitutes with the same medicine, strength and form are listed right now.'),
              )
            else
              SubstitutesList(result: r, productId: productId),
          ],
        ),
      ),
    );
  }
}
