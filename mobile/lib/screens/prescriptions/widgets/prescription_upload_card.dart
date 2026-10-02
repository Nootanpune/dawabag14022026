import 'package:flutter/material.dart';

import '../../../config/theme.dart';

/// "Upload a prescription": take a photo, pick from the gallery, or a PDF.
class PrescriptionUploadCard extends StatelessWidget {
  final bool busy;
  final VoidCallback onPhoto;
  final VoidCallback onPdf;
  /// e.g. "Or upload a new one" at checkout (Sprint 32)
  final String title;
  const PrescriptionUploadCard({
    super.key,
    required this.busy,
    required this.onPhoto,
    required this.onPdf,
    this.title = 'Upload a prescription',
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.brandGreen100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          const SizedBox(height: 4),
          const Text(
            "A clear photo or PDF of the whole prescription: doctor's name and registration number, date, your name and the medicines.",
            style: TextStyle(fontSize: 13, height: 1.35),
          ),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            onPressed: busy ? null : onPhoto,
            icon: busy
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.camera_alt_outlined, size: 20),
            label: Text(busy ? 'Uploading…' : 'Take or choose a photo'),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: busy ? null : onPdf,
            icon: const Icon(Icons.picture_as_pdf_outlined, size: 20),
            label: const Text('Choose a PDF'),
          ),
          const SizedBox(height: 6),
          Text('JPEG, PNG or PDF, up to 10 MB. Only you and our pharmacists can open it.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
        ],
      ),
    );
  }
}
