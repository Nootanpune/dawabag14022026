import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../models/policy.dart';
import '../../../providers/legal_provider.dart';
import '../../../services/api_service.dart';
import '../../../utils/ist.dart';
import '../../../widgets/error_retry_view.dart';
import 'policy_language_bar.dart';

/// /policies/:key?lang= — the current published version of a policy (terms,
/// privacy, shipping, cancellation, refund) from GET /legal/policies/:key
/// (C-39), in English, Marathi or Hindi (C-40). Public; nothing is cached on
/// the device.
class PolicyScreen extends ConsumerStatefulWidget {
  final String policyKey;
  final String initialLanguage;
  const PolicyScreen({super.key, required this.policyKey, this.initialLanguage = 'en'});

  @override
  ConsumerState<PolicyScreen> createState() => _PolicyScreenState();
}

class _PolicyScreenState extends ConsumerState<PolicyScreen> {
  late String _lang = normalizePolicyLanguage(widget.initialLanguage);

  @override
  Widget build(BuildContext context) {
    final policyKey = widget.policyKey;
    final arg = (policyKey, _lang);
    final async = ref.watch(policyInLanguageProvider(arg));
    final fallbackTitle = policyTitle(policyKey);
    return Scaffold(
      appBar: AppBar(title: Text(async.valueOrNull?.title ?? fallbackTitle)),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: PolicyLanguageBar(value: _lang, onChanged: (l) => setState(() => _lang = l)),
          ),
          Expanded(
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandTeal)),
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
                  onRetry: () => ref.invalidate(policyInLanguageProvider(arg)),
                );
              },
              data: (doc) => RefreshIndicator(
                color: AppTheme.brandTeal,
                onRefresh: () => ref.refresh(policyInLanguageProvider(arg).future),
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    if (doc.showingEnglishFallback)
                      Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.amber.shade50,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          'Not yet available in ${kPolicyLanguageNames[doc.requestedLanguage]}; showing English.',
                          style: TextStyle(fontSize: 12, color: Colors.amber.shade900),
                        ),
                      ),
                    Text(doc.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text(
                      [
                        if (doc.version != null)
                          'Version ${doc.version}${doc.language != 'en' ? ' (${kPolicyLanguageNames[doc.language]})' : ''}',
                        if (doc.effectiveFrom != null) 'Effective from ${formatDateIst(doc.effectiveFrom!)}',
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
          ),
        ],
      ),
    );
  }
}
