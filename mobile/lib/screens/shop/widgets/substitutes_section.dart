import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../models/product_page_extras.dart';
import '../../../providers/product_page_providers.dart';
import 'substitute_tile.dart';

const int kSubstitutesPreview = 3;

/// Product screen: the cheapest few substitutes and "See all"; hidden when there are none.
class SubstitutesSection extends ConsumerWidget {
  final String productId;
  const SubstitutesSection({super.key, required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(substitutesProvider((productId, kSubstitutesPreview)));
    return async.maybeWhen(
      data: (r) => r.total == 0 ? const SizedBox.shrink() : SubstitutesList(result: r, productId: productId, preview: true),
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class SubstitutesList extends StatelessWidget {
  final SubstitutesResult result;
  final String productId;
  final bool preview;
  const SubstitutesList({super.key, required this.result, required this.productId, this.preview = false});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (preview) ...[
          const SizedBox(height: 20),
          const Text('Substitutes', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        ],
        Text('This medicine: ${perUnitText(result.productPerUnitPaise, result.productUnitLabel)}',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
        for (final s in result.items) SubstituteTile(s: s),
        if (preview && result.total > result.items.length)
          TextButton(
            style: TextButton.styleFrom(padding: EdgeInsets.zero),
            onPressed: () => context.push('/medicine/$productId/substitutes'),
            child: Text('See all ${result.total} substitutes'),
          ),
        SubstitutesNote(note: result.note),
      ],
    );
  }
}
