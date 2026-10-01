import 'package:flutter/material.dart';

/// Asks why the consultation is being cancelled (3–500 characters, as the
/// server requires). Returns the reason, or null when the patient backs out.
Future<String?> askCancelReason(BuildContext context) =>
    showDialog<String>(context: context, builder: (_) => const _CancelConsultationDialog());

class _CancelConsultationDialog extends StatefulWidget {
  const _CancelConsultationDialog();

  @override
  State<_CancelConsultationDialog> createState() => _CancelConsultationDialogState();
}

class _CancelConsultationDialogState extends State<_CancelConsultationDialog> {
  final TextEditingController _reason = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  void _submit() {
    final text = _reason.text.trim();
    if (text.length < 3) {
      setState(() => _error = 'Enter at least 3 characters');
      return;
    }
    Navigator.pop(context, text);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Cancel consultation'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'You can cancel up to 2 hours before the slot. A paid fee is refunded in full '
              'to the way you paid.',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _reason,
              maxLength: 500,
              minLines: 1,
              maxLines: 3,
              decoration: InputDecoration(labelText: 'Reason', errorText: _error),
              onChanged: (_) {
                if (_error != null) setState(() => _error = null);
              },
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Keep it')),
          TextButton(
            onPressed: _submit,
            child: const Text('Cancel consultation', style: TextStyle(color: Colors.red)),
          ),
        ],
      );
}
