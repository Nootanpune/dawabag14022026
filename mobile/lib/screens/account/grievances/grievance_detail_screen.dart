import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../models/grievance.dart';
import '../../../providers/grievance_provider.dart';
import '../../../services/api_service.dart';
import '../../../services/grievance_api.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/error_retry_view.dart';
import 'grievance_thread.dart';
import 'grievance_tile.dart';

/// /account/complaints/:id — one complaint with its resolution and the
/// conversation with Dawabag support (C-36). Always fetched from the server.
class GrievanceDetailScreen extends ConsumerStatefulWidget {
  final String grievanceId;
  const GrievanceDetailScreen({super.key, required this.grievanceId});

  @override
  ConsumerState<GrievanceDetailScreen> createState() => _GrievanceDetailScreenState();
}

class _GrievanceDetailScreenState extends ConsumerState<GrievanceDetailScreen> {
  bool _sending = false;

  void _reload() => ref.invalidate(grievanceDetailProvider(widget.grievanceId));

  /// POST /grievances/:id/messages, then refetch. Returns true on success.
  Future<bool> _send(String body) async {
    setState(() => _sending = true);
    try {
      await apiService.postGrievanceMessage(widget.grievanceId, body);
      if (!mounted) return true;
      _reload();
      return true;
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(ApiService.errorMessage(e, fallback: 'Could not send your message')),
          backgroundColor: Colors.red,
        ));
      }
      return false;
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(grievanceDetailProvider(widget.grievanceId));
    final grievance = async.valueOrNull;

    return Scaffold(
      appBar: AppBar(
        title: Text(grievance?.ticketNo ?? 'Complaint'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _reload)],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load this complaint'),
          onRetry: _reload,
        ),
        data: (g) => Column(
          children: [
            Expanded(
              child: RefreshIndicator(
                color: AppTheme.brandGreen,
                onRefresh: () => ref.refresh(grievanceDetailProvider(widget.grievanceId).future),
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    _SummaryCard(grievance: g),
                    if (g.resolution != null && g.resolution!.trim().isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _ResolutionCard(text: g.resolution!),
                    ],
                    const SizedBox(height: 16),
                    Text('Conversation',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.grey.shade600)),
                    const SizedBox(height: 8),
                    if (g.messages.isEmpty)
                      Text('No messages yet. Our team will reply here.',
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade600))
                    else
                      ...g.messages.map((m) => GrievanceMessageBubble(message: m)),
                  ],
                ),
              ),
            ),
            if (g.isClosed)
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Text('This complaint is closed. Raise a new one if you still need help.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                ),
              )
            else
              GrievanceReplyBox(sending: _sending, onSend: _send),
          ],
        ),
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  final Grievance grievance;
  const _SummaryCard({required this.grievance});

  @override
  Widget build(BuildContext context) {
    final g = grievance;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(grievanceCategoryLabel(g.category),
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                ),
                GrievanceStatusChip(status: g.status),
              ],
            ),
            const SizedBox(height: 6),
            Text(g.subject, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            if (g.description != null) ...[
              const SizedBox(height: 6),
              Text(g.description!, style: const TextStyle(fontSize: 13)),
            ],
            const SizedBox(height: 8),
            if (g.createdAt != null)
              Text('Raised ${formatDateTime(g.createdAt!)}',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
            if (g.acknowledgedAt != null)
              Text('Acknowledged ${formatDateTime(g.acknowledgedAt!)}',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
            GrievanceDeadlineText(grievance: g),
            if (g.orderId != null)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => context.push('/orders/${g.orderId}'),
                  icon: const Icon(Icons.receipt_long, size: 16),
                  label: Text('Order ${g.orderNumber ?? ''}'.trim()),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ResolutionCard extends StatelessWidget {
  final String text;
  const _ResolutionCard({required this.text});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.brandGreen50,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Resolution',
                style: TextStyle(fontWeight: FontWeight.w700, color: AppTheme.brandGreen700)),
            const SizedBox(height: 4),
            Text(text, style: const TextStyle(fontSize: 13)),
          ],
        ),
      );
}
