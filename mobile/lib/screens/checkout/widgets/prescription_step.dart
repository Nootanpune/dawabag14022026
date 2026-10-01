import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../config/theme.dart';
import '../../../utils/ist.dart';

/// Bottom sheet: take a photo or pick from the gallery.
Future<ImageSource?> showPrescriptionSourceSheet(BuildContext context) =>
    showModalBottomSheet<ImageSource>(
      context: context,
      builder: (sheetContext) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 8),
          ListTile(
              leading: const Icon(Icons.camera_alt),
              title: const Text('Take photo'),
              onTap: () => Navigator.pop(sheetContext, ImageSource.camera)),
          ListTile(
              leading: const Icon(Icons.photo_library),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(sheetContext, ImageSource.gallery)),
          const SizedBox(height: 8),
        ],
      ),
    );

/// Asks camera/gallery, then picks an image. The file is only uploaded to
/// the server, never kept by the app (C-41). Null when cancelled.
Future<XFile?> pickPrescriptionImage(BuildContext context) async {
  final source = await showPrescriptionSourceSheet(context);
  if (source == null) return null;
  return ImagePicker().pickImage(source: source, imageQuality: 85);
}

/// valid_until as an India calendar date ("31 Dec 2026"), or a dash.
String _validUntil(Object? raw) {
  return istCalendarDay(raw) == null ? '—' : formatDateIst(raw);
}

// ── Prescription step ──────────────────────────────────────────────────────────
class PrescriptionStep extends StatelessWidget {
  final XFile? prescriptionFile;
  final List savedPrescriptions;
  final String? selectedSavedId;
  final VoidCallback onPickFile;
  final void Function(String) onSelectSaved;

  const PrescriptionStep({
    super.key,
    required this.prescriptionFile, required this.savedPrescriptions,
    required this.selectedSavedId, required this.onPickFile, required this.onSelectSaved,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Upload prescription',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text('Required for Schedule H medicines in your cart.',
          style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
        const SizedBox(height: 20),

        // Upload zone
        GestureDetector(
          onTap: onPickFile,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 32),
            decoration: BoxDecoration(
              border: Border.all(
                color: prescriptionFile != null ? AppTheme.brandGreen : Colors.grey.shade300,
                width: 1.5,
                style: BorderStyle.solid,
              ),
              borderRadius: BorderRadius.circular(12),
              color: prescriptionFile != null ? AppTheme.brandGreen50 : Colors.grey.shade50,
            ),
            child: Column(
              children: [
                Icon(
                  prescriptionFile != null ? Icons.check_circle : Icons.upload_file,
                  size: 44,
                  color: prescriptionFile != null ? AppTheme.brandGreen : Colors.grey.shade400,
                ),
                const SizedBox(height: 10),
                Text(
                  prescriptionFile != null ? prescriptionFile!.name : 'Tap to upload or take photo',
                  style: TextStyle(
                    fontWeight: FontWeight.w600, fontSize: 14,
                    color: prescriptionFile != null ? AppTheme.brandGreen700 : Colors.grey.shade600,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 4),
                Text('JPEG, PNG or PDF · Max 10 MB',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade400)),
              ],
            ),
          ),
        ),

        if (savedPrescriptions.isNotEmpty) ...[
          const SizedBox(height: 20),
          const Text('Or use a saved prescription',
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          const SizedBox(height: 4),
          // Only verified, unexpired prescriptions are listed; the server
          // checks it covers this order and a pharmacist confirms it (C-08).
          Text('Verified by our pharmacist and still valid.',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
          const SizedBox(height: 10),
          ...savedPrescriptions.whereType<Map>().map((rx) => GestureDetector(
            onTap: () => onSelectSaved(rx['id']?.toString() ?? ''),
            child: Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                border: Border.all(
                  color: selectedSavedId == rx['id']?.toString() ? AppTheme.brandGreen : Colors.grey.shade200,
                  width: selectedSavedId == rx['id']?.toString() ? 2 : 1,
                ),
                borderRadius: BorderRadius.circular(10),
                color: selectedSavedId == rx['id']?.toString() ? AppTheme.brandGreen50 : Colors.white,
              ),
              child: Row(
                children: [
                  const Icon(Icons.description, color: AppTheme.brandGreen, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(rx['doctor_name'] != null ? 'Dr. ${rx['doctor_name']}' : 'Uploaded prescription',
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13,
                            color: AppTheme.brandGreen700)),
                        Text('Valid until ${_validUntil(rx['valid_until'])}',
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          )),
        ],

        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFFFAEEDA),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              const Text('📞', style: TextStyle(fontSize: 16)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Our pharmacist will call you to verify the prescription before dispatching your order.',
                  style: TextStyle(fontSize: 12, color: Colors.brown.shade700),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
