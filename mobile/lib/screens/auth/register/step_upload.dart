import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import 'register_constants.dart';
import 'register_controller.dart';
import 'register_uploads.dart';
import 'register_widgets.dart';

/// Step 4b — after OTP: per-file KYC upload status with retry.
class StepUpload extends StatelessWidget {
  final RegisterController c;
  const StepUpload({super.key, required this.c});

  @override
  Widget build(BuildContext context) {
    final rows = c.uploadRows;
    final hasFailed = c.anyFailed;
    final missing = (c.missingDocs ?? const <String>[])
        .where((d) => !c.files.containsKey(d))
        .toList();
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Row(
          children: const [
            Icon(Icons.verified, color: AppTheme.brandGreen),
            SizedBox(width: 8),
            Expanded(
              child: Text('Mobile verified',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text('Uploading your documents for KYC review.',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 14)),
        const SizedBox(height: 20),
        for (final type in rows) ...[
          _uploadTile(type),
          const SizedBox(height: 10),
        ],
        if (missing.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            'Still required: ${missing.map(docLabel).join(', ')}',
            style: const TextStyle(color: AppTheme.amberText, fontSize: 13.5),
          ),
        ],
        const SizedBox(height: 20),
        if (hasFailed && !c.anyUploading) ...[
          OutlinedButton(
            onPressed: c.uploadAll,
            child: const Text('Retry failed uploads'),
          ),
          const SizedBox(height: 12),
        ],
        RegisterPrimaryButton(
          'Submit application',
          (c.allUploadsDone && !c.anyUploading) ? () => c.goTo(RegisterStep.submitted) : null,
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: c.anyUploading
              ? null
              : () => c.finish(
                    message: 'KYC review starts once all required documents are uploaded.',
                  ),
          child: const Text('Skip for now'),
        ),
      ],
    );
  }

  Widget _uploadTile(String type) {
    final file = c.files[type];
    final status = file == null ? null : (c.uploadStatus[type] ?? UploadStatus.pending);

    Widget leading = Icon(Icons.description_outlined, color: Colors.grey.shade500);
    String subtitle = 'No file selected';
    Color subtitleColor = Colors.grey.shade600;
    if (status == UploadStatus.uploading) {
      leading = const SizedBox(
        width: 22,
        height: 22,
        child: CircularProgressIndicator(strokeWidth: 2),
      );
      subtitle = 'Uploading…';
    } else if (status == UploadStatus.done) {
      leading = const Icon(Icons.check_circle, color: AppTheme.brandGreen);
      subtitle = 'Uploaded';
    } else if (status == UploadStatus.failed) {
      leading = const Icon(Icons.error, color: AppTheme.errorRed);
      subtitle = c.uploadError[type] ?? 'Upload failed';
      subtitleColor = AppTheme.errorRed;
    } else if (status == UploadStatus.pending) {
      leading = Icon(Icons.schedule, color: Colors.grey.shade500);
      subtitle = 'Waiting…';
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
        child: Row(
          children: [
            leading,
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(docLabel(type),
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  if (file != null) ...[
                    const SizedBox(height: 2),
                    Text(file.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
                  ],
                  const SizedBox(height: 2),
                  Text(subtitle, style: TextStyle(fontSize: 12.5, color: subtitleColor)),
                ],
              ),
            ),
            if (status == UploadStatus.failed) ...[
              TextButton(
                onPressed: () => c.uploadOne(type),
                child: const Text('Retry'),
              ),
              IconButton(
                tooltip: 'Choose another file',
                icon: const Icon(Icons.swap_horiz, size: 20),
                onPressed: () => c.pickFile(type, uploadNow: true),
              ),
            ],
            if (status == null)
              TextButton(
                onPressed: () => c.pickFile(type, uploadNow: true),
                child: const Text('Choose'),
              ),
          ],
        ),
      ),
    );
  }
}
