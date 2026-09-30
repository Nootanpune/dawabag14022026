import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../models/policy.dart';
import '../../../providers/legal_provider.dart';
import '../../../utils/formatters.dart';

/// "Policies" card on About & legal: every published policy from
/// GET /legal/policies, each opening /policies/:key (C-39).
class PoliciesSection extends ConsumerWidget {
  const PoliciesSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(policiesProvider);
    final policies = async.valueOrNull ?? const <PolicyRef>[];
    if (async.hasError) {
      return Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: ListTile(
          title: const Text('Could not load policies', style: TextStyle(fontSize: 13)),
          trailing: TextButton(
            onPressed: () => ref.invalidate(policiesProvider),
            child: const Text('Retry'),
          ),
        ),
      );
    }
    if (policies.isEmpty) return const SizedBox.shrink();
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(14, 14, 14, 4),
            child: Text('Policies', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          ),
          ...policies.map((p) => ListTile(
                dense: true,
                title: Text(p.title, style: const TextStyle(fontSize: 14)),
                subtitle: p.effectiveFrom == null
                    ? null
                    : Text('Effective from ${formatDate(p.effectiveFrom!)}',
                        style: const TextStyle(fontSize: 11)),
                trailing: const Icon(Icons.chevron_right, size: 20),
                onTap: () => context.push('/policies/${p.key}'),
              )),
        ],
      ),
    );
  }
}
