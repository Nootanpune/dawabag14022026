import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../providers/grievance_provider.dart';
import '../../../widgets/error_retry_view.dart';
import 'grievance_tile.dart';

/// /account/complaints — the buyer's complaints and their deadlines (C-36).
/// Everything comes from the server and is reloaded on open and on pull.
class GrievanceListScreen extends ConsumerStatefulWidget {
  const GrievanceListScreen({super.key});

  @override
  ConsumerState<GrievanceListScreen> createState() => _GrievanceListScreenState();
}

class _GrievanceListScreenState extends ConsumerState<GrievanceListScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(grievanceProvider.notifier).load());
  }

  Future<void> _openNew() async {
    await context.push('/account/complaints/new');
    if (mounted) await ref.read(grievanceProvider.notifier).load();
  }

  Future<void> _open(String id) async {
    await context.push('/account/complaints/$id');
    if (mounted) await ref.read(grievanceProvider.notifier).load();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(grievanceProvider);
    final notifier = ref.read(grievanceProvider.notifier);

    Widget body;
    if (!state.loaded && state.isLoading) {
      body = const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen));
    } else if (state.error != null && state.grievances.isEmpty) {
      body = ErrorRetryView(message: state.error!, onRetry: notifier.load);
    } else {
      body = RefreshIndicator(
        color: AppTheme.brandGreen,
        onRefresh: notifier.load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Tell us about any problem with an order, delivery, refund or your data. '
              'Each complaint gets a ticket number and deadlines for our reply.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 12),
            if (state.isLoading) const LinearProgressIndicator(color: AppTheme.brandGreen),
            if (state.grievances.isEmpty)
              const _EmptyComplaints()
            else
              ...state.grievances.map((g) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: GrievanceTile(grievance: g, onTap: () => _open(g.id)),
                  )),
            const SizedBox(height: 72),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Complaints'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: notifier.load),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _openNew,
        backgroundColor: AppTheme.brandGreen,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('New complaint'),
      ),
      body: body,
    );
  }
}

class _EmptyComplaints extends StatelessWidget {
  const _EmptyComplaints();

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              Icon(Icons.support_agent, size: 40, color: Colors.grey.shade400),
              const SizedBox(height: 10),
              const Text('No complaints', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text(
                'If something went wrong, tap "New complaint" and we will get back to you.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
            ],
          ),
        ),
      );
}
