import 'package:flutter/material.dart';

/// Confirms ending a consultation and takes optional notes (up to 5000
/// characters, as the server allows). Returns the notes ('' when none), or
/// null when the doctor backs out.
Future<String?> askEndConsultation(BuildContext context) =>
    showDialog<String>(context: context, builder: (_) => const _EndConsultationDialog());

class _EndConsultationDialog extends StatefulWidget {
  const _EndConsultationDialog();

  @override
  State<_EndConsultationDialog> createState() => _EndConsultationDialogState();
}

class _EndConsultationDialogState extends State<_EndConsultationDialog> {
  final TextEditingController _notes = TextEditingController();

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('End consultation'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'The consultation is marked completed and neither of you can join the call again. '
              'Write the e-prescription on the Dawabag website.',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _notes,
              maxLength: 5000,
              minLines: 2,
              maxLines: 5,
              decoration: const InputDecoration(labelText: 'Consultation notes (optional)'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Not yet')),
          TextButton(
            onPressed: () => Navigator.pop(context, _notes.text.trim()),
            child: const Text('End consultation', style: TextStyle(color: Colors.red)),
          ),
        ],
      );
}
