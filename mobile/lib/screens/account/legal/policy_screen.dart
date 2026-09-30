import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../models/policy.dart';
import '../../../providers/legal_provider.dart';
import '../../../services/api_service.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/error_retry_view.dart';

/// /policies/:key — the current published version of a policy (terms,
/// privacy, shipping, cancellation, refund) from GET /legal/policies/:key
/// (C-39). Public; nothing is cached on the device.
class PolicyScreen extends ConsumerWidget {
  final String policyKey;
  const PolicyScreen({super.key, required this.policyKey});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(policyProvider(policyKey));
    final fallbackTitle = policyTitle(policyKey);
    return Scaffold(
      appBar: AppBar(title: Text(async.valueOrNull?.title ?? fallbackTitle)),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
        error: (e, _) {
          final notPublished = e is DioException && e.response?.statusCode == 404;
          if (notPublished) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text('$fallbackTitle has not been published yet.',
                    textAlign: TextAlign.center, style: TextStyle(color: Colors.grey.shade600)),
              ),
            );
          }
          return ErrorRetryView(
            message: ApiService.errorMessage(e, fallback: 'Could not load this policy'),
            onRetry: () => ref.invalidate(policyProvider(policyKey)),
          );
        },
        data: (doc) => RefreshIndicator(
          color: AppTheme.brandGreen,
          onRefresh: () => ref.refresh(policyProvider(policyKey).future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(doc.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(
                [
                  if (doc.version != null) 'Version ${doc.version}',
                  if (doc.effectiveFrom != null) 'Effective from ${formatDate(doc.effectiveFrom!)}',
                ].join(' · '),
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
              const Divider(height: 24),
              SelectableText(doc.body, style: const TextStyle(fontSize: 14, height: 1.5)),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
