import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../config/theme.dart';
import '../../../utils/ist.dart';
import 'rx_policy_note.dart';

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
  /// "Amoxicillin 500 mg Capsule × 1": the lines that need a prescription (C-08)
  final List<String> rxItems;

  const PrescriptionStep({
    super.key,
    required this.prescriptionFile, required this.savedPrescriptions,
    required this.selectedSavedId, required this.onPickFile, required this.onSelectSaved,
    this.rxItems = const [],
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Prescription needed',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text(rxItems.isEmpty ? 'Some medicines in this order need a doctor’s prescription.' : 'These medicines need a doctor’s prescription:',
          style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
        for (final item in rxItems)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 8),
            child: Text('• $item', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
        const SizedBox(height: 16),
        const Text('Upload a new one, or choose one you uploaded earlier below.',
          style: TextStyle(fontSize: 12)),
        const SizedBox(height: 8),

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
          const Text('Or use a prescription you uploaded earlier',
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          const SizedBox(height: 4),
          // Verified and unexpired, or uploaded earlier and not yet checked; the
          // server checks it can be used and a pharmacist confirms it (C-08).
          Text('Our pharmacist checks it with this order before dispatch.',
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
                        Text(rx['doctor_name'] != null ? 'Prescription from Dr ${rx['doctor_name']}' : rx['file_type'] == 'pdf' ? 'Prescription (PDF)' : 'Prescription photo',
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13,
                            color: AppTheme.brandGreen700)),
                        Text('Uploaded ${formatDateTimeIst(rx['created_at'])}',
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
                        Text(rx['status'] == 'pending'
                            ? 'Not checked yet — our pharmacist checks it with this order'
                            : 'Checked · valid until ${_validUntil(rx['valid_until'])}',
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                      ],
                    ),
                  ),
                  if (selectedSavedId == rx['id']?.toString())
                    const Column(children: [
                      Icon(Icons.check_circle, color: AppTheme.brandGreen),
                      Text('Chosen', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.brandGreen700)),
                    ])
                  else
                    Icon(Icons.radio_button_unchecked, color: Colors.grey.shade400),
                ],
              ),
            ),
          )),
        ],

        const SizedBox(height: 16),
        const RxPolicyNote(),
      ],
    );
  }
}
