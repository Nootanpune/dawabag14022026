import 'package:flutter/material.dart';

import '../../../../config/theme.dart';
import '../../../../models/json_utils.dart';
import '../../../../services/api_service.dart';
import '../../../../services/prescription_api.dart';
import '../../../../utils/prescription_status.dart';
import '../../../../widgets/uploads/pick_document.dart';
import '../../../checkout/widgets/rx_choice_card.dart';
import '../../../prescriptions/widgets/prescription_upload_card.dart';

/// Prescriptions that can go with prescription medicines added to [orderId]
/// (backend orderEdit/prescription.ts): the one already sent with this order
/// and not yet checked, a new upload not yet with any order, or a saved one our
/// pharmacist verified that is still valid.
List<Map<String, dynamic>> editRxChoices(List<Map<String, dynamic>> mine, String orderId) => [
      ...mine.where((r) => asString(r['order_id']) == orderId && r['status'] == 'pending'),
      ...mine.where(isUsableAtCheckout),
    ];

/// A valid prescription for prescription medicines added or raised (Sprint 44,
/// owner decision 2026-10-03; C-08), as the website's EditRxPicker: choose the
/// order's own, a saved verified one, or upload a new one (the file goes only to
/// the server). The order then goes back to our pharmacist's prescription check.
class EditRxPicker extends StatefulWidget {
  final String orderId;
  /// The prescription medicines being added or raised
  final List<String> names;
  final String? value;
  final ValueChanged<String> onChanged;
  final RxLinkLoader? loadLink;

  const EditRxPicker({super.key, required this.orderId, required this.names, required this.value, required this.onChanged, this.loadLink});

  @override
  State<EditRxPicker> createState() => _EditRxPickerState();
}

class _EditRxPickerState extends State<EditRxPicker> {
  static const _maxBytes = 10 * 1024 * 1024; // what the server accepts for a prescription
  List<Map<String, dynamic>> _list = const [];
  bool _loading = true;
  bool _uploading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final mine = await apiService.getMyPrescriptions();
      if (mounted) setState(() => _list = editRxChoices(mine, widget.orderId));
    } catch (_) {
      // Uploading a new one still works
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

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
    setState(() => _uploading = true);
    try {
      final created = await apiService.uploadPrescription(filePath: file.path, filename: file.name);
      await _load();
      final id = asString(created['id']);
      if (id != null && mounted) widget.onChanged(id);
    } catch (e) {
      if (mounted) setState(() => _error = ApiService.errorMessage(e, fallback: 'Upload failed. Please try again.'));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      key: const ValueKey('edit-rx-picker'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF8E6),
        border: Border.all(color: Colors.amber.shade200),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.description_outlined, size: 18, color: AppTheme.brandTeal700),
            const SizedBox(width: 8),
            Expanded(
              child: Text('Prescription needed for ${widget.names.join(', ')}',
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
            ),
          ]),
          const SizedBox(height: 4),
          Text('Choose a valid prescription that covers it, or upload one. Our pharmacist checks it before the order is approved.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade800)),
          const SizedBox(height: 8),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Center(child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))),
            ),
          for (final rx in _list)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: RxChoiceCard(
                rx: rx,
                selected: asString(rx['id']) == widget.value,
                onSelect: () => widget.onChanged(asString(rx['id']) ?? ''),
                loadLink: widget.loadLink,
              ),
            ),
          PrescriptionUploadCard(
            title: _list.isEmpty ? 'Upload your prescription' : 'Or upload a new one',
            busy: _uploading,
            onPhoto: () => _upload(() => pickPhotoDocument(context, maxBytes: _maxBytes)),
            onPdf: () => _upload(() => pickPdfDocument(maxBytes: _maxBytes)),
          ),
          if (_error != null) ...[
            const SizedBox(height: 6),
            Text(_error!, style: TextStyle(fontSize: 12.5, color: Colors.red.shade900)),
          ],
        ],
      ),
    );
  }
}
