import 'package:flutter/material.dart';

import '../../models/practitioner.dart';
import '../../services/api_service.dart';
import '../../services/practitioner_api.dart';
import '../uploads/pick_document.dart';

/// (a) Upload the doctor's signed requisition (Sprint 44; r.65(9)(b)): a photo
/// from the camera or gallery, or a PDF — up to 5 MB, straight to the server's
/// object store (POST /written-orders/upload); nothing is kept on the phone.
class WrittenOrderUploadPanel extends StatefulWidget {
  final ValueChanged<WrittenOrder> onUploaded;
  const WrittenOrderUploadPanel({super.key, required this.onUploaded});

  @override
  State<WrittenOrderUploadPanel> createState() => _WrittenOrderUploadPanelState();
}

class _WrittenOrderUploadPanelState extends State<WrittenOrderUploadPanel> {
  bool _busy = false;
  String? _error;

  Future<void> _upload(Future<PickedDocument?> Function() pick) async {
    setState(() => _error = null);
    PickedDocument? file;
    try {
      file = await pick();
    } on PickRefused catch (e) {
      setState(() => _error = e.message);
      return;
    }
    if (file == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final wo = await apiService.uploadWrittenOrder(filePath: file.path, filename: file.name);
      if (mounted) widget.onUploaded(wo);
    } catch (e) {
      if (mounted) setState(() => _error = ApiService.errorMessage(e, fallback: 'Upload failed. Please try again.'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Your signed requisition (PDF, or a photo — JPEG or PNG, up to 5 MB)',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade800)),
        const SizedBox(height: 8),
        ElevatedButton.icon(
          key: const ValueKey('wo-upload-photo'),
          onPressed: _busy ? null : () => _upload(() => pickPhotoDocument(context, maxBytes: kWrittenOrderMaxBytes)),
          icon: _busy
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.camera_alt_outlined, size: 18),
          label: Text(_busy ? 'Uploading…' : 'Take or choose a photo'),
        ),
        const SizedBox(height: 6),
        OutlinedButton.icon(
          key: const ValueKey('wo-upload-pdf'),
          onPressed: _busy ? null : () => _upload(() => pickPdfDocument(maxBytes: kWrittenOrderMaxBytes)),
          icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
          label: const Text('Choose a PDF'),
        ),
        if (_error != null) ...[
          const SizedBox(height: 6),
          Text(_error!, style: TextStyle(fontSize: 12.5, color: Colors.red.shade900)),
        ],
        const SizedBox(height: 6),
        Text('Our pharmacist checks that it is signed and lists these medicines before supplying them.',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
      ],
    );
  }
}
