import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../models/privacy.dart';
import '../../../providers/privacy_provider.dart';
import '../../../utils/ist.dart';

/// The buyer's correction / erasure requests and their outcome, from
/// GET /privacy/requests (C-40..C-44). Hidden when there are none.
class DataRequestsSection extends ConsumerWidget {
  const DataRequestsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(dataRequestsProvider);
    return async.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => Card(
        child: ListTile(
          title: const Text('Could not load your requests', style: TextStyle(fontSize: 13)),
          trailing: TextButton(
            onPressed: () => ref.invalidate(dataRequestsProvider),
            child: const Text('Retry'),
          ),
        ),
      ),
      data: (requests) {
        if (requests.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 16, bottom: 6, left: 4),
              child: Text('YOUR REQUESTS',
                  style: TextStyle(
                      fontSize: 11, fontWeight: FontWeight.w700, color: Colors.grey.shade500, letterSpacing: 0.8)),
            ),
            Card(child: Column(children: requests.map(_tile).toList())),
          ],
        );
      },
    );
  }

  Widget _tile(DataRequest r) => ListTile(
        dense: true,
        leading: const Icon(Icons.assignment_outlined),
        title: Text(r.typeLabel, style: const TextStyle(fontSize: 14)),
        subtitle: Text(
          [
            r.statusLabel,
            if (r.createdAt != null) formatDateIst(r.createdAt!),
            if ((r.outcome ?? '').isNotEmpty) r.outcome!,
          ].join(' · '),
          style: const TextStyle(fontSize: 12),
        ),
      );
}
