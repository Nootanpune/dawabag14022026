import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import 'register_constants.dart';
import 'register_controller.dart';
import 'register_docs.dart';
import 'register_widgets.dart';

/// Step 3 (B2B / doctor) — pick documents; held in memory until after OTP.
class StepDocuments extends StatelessWidget {
  final RegisterController c;
  const StepDocuments({super.key, required this.c});

  @override
  Widget build(BuildContext context) {
    final requiredDocs = c.requiredDocs;
    final optionalDocs = c.optionalDocs;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Text('Upload your documents',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text(
          'PDF, JPG or PNG, max 5 MB each. Files are uploaded after you verify your mobile number.',
          style: TextStyle(color: Colors.grey.shade600, fontSize: 13.5),
        ),
        const SizedBox(height: 20),
        for (final type in requiredDocs) ...[
          _documentPickTile(type, isRequired: true),
          const SizedBox(height: 10),
        ],
        for (final type in optionalDocs) ...[
          _documentPickTile(type, isRequired: false),
          const SizedBox(height: 10),
        ],
        const SizedBox(height: 14),
        RegisterErrorBanner(error: c.error),
        RegisterPrimaryButton(
          c.isRegistered ? 'Continue' : 'Create account & send OTP',
          c.submitDocuments,
          loading: c.isSubmitting,
        ),
      ],
    );
  }

  Widget _documentPickTile(String type, {required bool isRequired}) {
    final file = c.files[type];
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
        child: Row(
          children: [
            Icon(
              file != null ? Icons.check_circle : Icons.description_outlined,
              color: file != null ? AppTheme.brandGreen : Colors.grey.shade500,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    isRequired ? docLabel(type) : '${docLabel(type)} (optional)',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    file != null
                        ? '${file.name} · ${_formatSize(file.size)}'
                        : 'No file selected',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600),
                  ),
                ],
              ),
            ),
            if (file != null)
              IconButton(
                tooltip: 'Remove',
                icon: const Icon(Icons.close, size: 20),
                onPressed: () => c.removeFile(type),
              ),
            TextButton(
              onPressed: c.isSubmitting ? null : () => c.pickFile(type),
              child: Text(file != null ? 'Change' : 'Choose'),
            ),
          ],
        ),
      ),
    );
  }

  String _formatSize(int bytes) {
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}
