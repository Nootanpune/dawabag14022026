import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../providers/catalog_provider.dart';

/// A search that found nothing: say so, offer close names from the server
/// ("Did you mean"), tips, and the prescription upload.
class NoResultsView extends ConsumerWidget {
  final String query;
  final ValueChanged<String> onSuggestion;
  const NoResultsView({super.key, required this.query, required this.onSuggestion});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final suggestions = ref.watch(searchSuggestionsProvider(query)).valueOrNull ?? const <String>[];
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Icon(Icons.search_off, size: 48, color: AppTheme.brandTeal),
        const SizedBox(height: 12),
        Text('No medicines found for "$query"',
            textAlign: TextAlign.center, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
        if (suggestions.isNotEmpty) ...[
          const SizedBox(height: 12),
          const Text('Did you mean:', textAlign: TextAlign.center),
          const SizedBox(height: 6),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 8,
            children: [for (final s in suggestions) ActionChip(label: Text(s), onPressed: () => onSuggestion(s))],
          ),
          Text('Check that the name matches your prescription exactly.',
              textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
        ],
        const SizedBox(height: 16),
        const Text('• Check the spelling, or type fewer letters.\n'
            '• Search by the generic (salt) name printed on the pack, such as paracetamol, cetirizine or pantoprazole.',
            style: TextStyle(fontSize: 13, height: 1.5)),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: () => context.push('/account/prescriptions'),
          icon: const Icon(Icons.upload_file, size: 20),
          label: const Text('Upload a prescription instead'),
        ),
      ],
    );
  }
}
