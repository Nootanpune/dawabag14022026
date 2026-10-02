import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/theme.dart';
import '../../providers/product_page_providers.dart';
import '../../services/api_service.dart';
import '../../widgets/error_retry_view.dart';

/// A trust page (Sprint 33) from the server: "## " heading, "- " list item,
/// blank line = new paragraph. Numbers in it come from today's settings.
class InfoPageScreen extends ConsumerWidget {
  final String pageKey;
  const InfoPageScreen({super.key, required this.pageKey});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(infoPageProvider(pageKey));
    return Scaffold(
      appBar: AppBar(title: Text(async.valueOrNull?.title ?? 'About Dawabag')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandTeal)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load this page'),
          onRetry: () => ref.invalidate(infoPageProvider(pageKey)),
        ),
        data: (p) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(p.title, style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
            const SizedBox(height: 6),
            Text(p.summary, style: TextStyle(fontSize: 14, color: Colors.grey.shade700)),
            const SizedBox(height: 12),
            ...infoPageBlocks(p.body),
          ],
        ),
      ),
    );
  }
}

/// Plain text → widgets; no markup is ever interpreted.
List<Widget> infoPageBlocks(String body) {
  final out = <Widget>[];
  final para = <String>[];
  void flush() {
    if (para.isNotEmpty) {
      out.add(Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(para.join(' '), style: const TextStyle(fontSize: 14, height: 1.45))));
      para.clear();
    }
  }

  for (final raw in body.split('\n')) {
    final line = raw.trim();
    if (line.isEmpty) {
      flush();
    } else if (line.startsWith('## ')) {
      flush();
      out.add(Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 6),
        child: Text(line.substring(3).trim(), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      ));
    } else if (line.startsWith('- ')) {
      flush();
      out.add(Padding(padding: const EdgeInsets.only(bottom: 4, left: 4), child: Text('•  ${line.substring(2).trim()}', style: const TextStyle(fontSize: 14, height: 1.4))));
    } else {
      para.add(line);
    }
  }
  flush();
  return out;
}
