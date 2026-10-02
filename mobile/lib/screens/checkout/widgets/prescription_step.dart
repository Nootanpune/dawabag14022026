import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../prescriptions/widgets/prescription_upload_card.dart';
import 'rx_choice_card.dart';
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

// ── Prescription step (Sprint 32: before review, as the web) ─────────────────
/// Which prescription goes with this order: one uploaded earlier (picture,
/// date and time, status) or a new upload, which is then chosen. Chosen before
/// the order is placed, so review and payment can say which one is attached;
/// a pharmacist checks it with the order before dispatch (C-08). Also used
/// after placing when the chosen one could not be used ([error]).
class PrescriptionStep extends StatefulWidget {
  /// "Amoxicillin 500 mg Capsule × 1": the lines that need a prescription (C-08)
  final List<String> rxItems;
  /// The buyer's prescriptions usable at checkout (GET /prescriptions/my)
  final List<Map<String, dynamic>> prescriptions;
  final bool loading;
  final String? selectedId;
  final ValueChanged<String> onSelect;
  final VoidCallback onPhoto;
  final VoidCallback onPdf;
  final bool uploading;
  /// e.g. the server said the chosen prescription cannot be used
  final String? error;
  final RxLinkLoader? loadLink;

  const PrescriptionStep({
    super.key,
    required this.rxItems,
    required this.prescriptions,
    required this.selectedId,
    required this.onSelect,
    required this.onPhoto,
    required this.onPdf,
    this.loading = false,
    this.uploading = false,
    this.error,
    this.loadLink,
  });

  /// How many cards show before "Show all".
  static const shown = 4;

  @override
  State<PrescriptionStep> createState() => _PrescriptionStepState();
}

class _PrescriptionStepState extends State<PrescriptionStep> {
  bool _all = false;

  @override
  Widget build(BuildContext context) {
    final w = widget;
    final usable = w.prescriptions;
    final listed = _all ? [...usable] : usable.take(PrescriptionStep.shown).toList();
    final chosen = usable.where((r) => r['id']?.toString() == w.selectedId);
    if (chosen.isNotEmpty && !listed.contains(chosen.first)) listed.add(chosen.first);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Prescription needed', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text(
            w.rxItems.isEmpty
                ? 'Some medicines in this order need a doctor’s prescription.'
                : 'These medicines need a doctor’s prescription:',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
        for (final item in w.rxItems)
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 8),
            child: Text('• $item', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
        const SizedBox(height: 16),
        if (w.loading)
          Row(children: [
            const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
            const SizedBox(width: 8),
            Text('Loading your prescriptions…', style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
          ])
        else if (usable.isNotEmpty) ...[
          const Text('Choose one of your prescriptions', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          for (final rx in listed)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: RxChoiceCard(
                rx: rx,
                selected: rx['id']?.toString() == w.selectedId,
                onSelect: () => w.onSelect(rx['id']?.toString() ?? ''),
                loadLink: w.loadLink,
              ),
            ),
          if (usable.length > PrescriptionStep.shown && !_all)
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => setState(() => _all = true),
                child: Text('Show all ${usable.length} prescriptions'),
              ),
            ),
        ],
        const SizedBox(height: 8),
        PrescriptionUploadCard(
          title: usable.isEmpty ? 'Upload your prescription' : 'Or upload a new one',
          busy: w.uploading,
          onPhoto: w.onPhoto,
          onPdf: w.onPdf,
        ),
        const SizedBox(height: 8),
        Text(
          'It must show the doctor’s name and registration number, the date, the patient’s name and these medicines.',
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
        ),
        const SizedBox(height: 12),
        const RxPolicyNote(),
        if (w.error != null) ...[
          const SizedBox(height: 12),
          Semantics(
            liveRegion: true,
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                border: Border.all(color: Colors.red.shade200),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(w.error!, style: TextStyle(fontSize: 13, color: Colors.red.shade900)),
            ),
          ),
        ],
      ],
    );
  }
}
