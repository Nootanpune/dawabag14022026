import 'package:flutter/material.dart';

import '../../auth/register/register_constants.dart' show kPrivacyNoticeUrl;

/// Correction / erasure requests and the data-export note (C-40..C-44).
class DataRightsSection extends StatelessWidget {
  final bool busy;
  final VoidCallback onCorrection;
  final VoidCallback onErasure;
  final VoidCallback onOpenNotice;

  const DataRightsSection({
    super.key,
    required this.busy,
    required this.onCorrection,
    required this.onErasure,
    required this.onOpenNotice,
  });

  @override
  Widget build(BuildContext context) => Card(
        child: Column(
          children: [
            ListTile(
              leading: const Icon(Icons.edit_note),
              title: const Text('Correct my data', style: TextStyle(fontSize: 14)),
              subtitle: const Text('Ask us to fix wrong or incomplete details', style: TextStyle(fontSize: 12)),
              onTap: busy ? null : onCorrection,
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: Colors.red),
              title: const Text('Delete my account data', style: TextStyle(fontSize: 14)),
              subtitle: const Text(
                'Records the law requires us to keep (tax invoices, prescriptions, '
                'Schedule H1 register) are retained; everything else is erased.',
                style: TextStyle(fontSize: 12),
              ),
              onTap: busy ? null : onErasure,
            ),
            const ListTile(
              leading: Icon(Icons.download_outlined),
              title: Text('Download a copy of my data', style: TextStyle(fontSize: 14)),
              // The app writes no files (server is the single source of truth);
              // the export is offered on the website instead.
              subtitle: Text(
                'Available when you sign in on the Dawabag website (dawabag.in).',
                style: TextStyle(fontSize: 12),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.policy_outlined),
              title: const Text('Read the privacy notice', style: TextStyle(fontSize: 14)),
              subtitle: const Text(kPrivacyNoticeUrl, style: TextStyle(fontSize: 12)),
              trailing: const Icon(Icons.open_in_new, size: 18),
              onTap: onOpenNotice,
            ),
          ],
        ),
      );
}

/// Asks for optional details for a correction/erasure request. Returns the
/// text (possibly empty) when confirmed, or null when cancelled.
Future<String?> askDataRequestDetails(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  required String hint,
  bool destructive = false,
}) {
  return showDialog<String>(
    context: context,
    builder: (ctx) => _DetailsDialog(
      title: title,
      message: message,
      confirmLabel: confirmLabel,
      hint: hint,
      destructive: destructive,
    ),
  );
}

class _DetailsDialog extends StatefulWidget {
  final String title, message, confirmLabel, hint;
  final bool destructive;
  const _DetailsDialog({
    required this.title,
    required this.message,
    required this.confirmLabel,
    required this.hint,
    required this.destructive,
  });

  @override
  State<_DetailsDialog> createState() => _DetailsDialogState();
}

class _DetailsDialogState extends State<_DetailsDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(widget.title),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.message, style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 12),
            TextField(
              controller: _controller,
              maxLength: 2000,
              minLines: 2,
              maxLines: 5,
              decoration: InputDecoration(hintText: widget.hint),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(context, _controller.text.trim()),
            child: Text(widget.confirmLabel,
                style: TextStyle(color: widget.destructive ? Colors.red : null)),
          ),
        ],
      );
}
