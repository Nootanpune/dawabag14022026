import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/theme.dart';
import '../../models/practitioner.dart';
import '../../providers/practitioner_provider.dart';
import '../../utils/ist.dart';
import 'written_order_sign_form.dart';
import 'written_order_upload_panel.dart';

/// The doctor's / institution's signed written order (Sprint 44; Drugs Rules
/// 1945 r.65(9)(b); FDA Maharashtra circular Drug/Wholesalers Memo./16/2026/1),
/// as the website's WrittenOrderPicker: reuse one made in the last 30 days
/// (GET /written-orders/mine), sign the requisition for [items] here, or upload
/// the signed requisition. Only its id is held, in memory; the server keeps it
/// final and links it once to the order (or change) it authorises.
class WrittenOrderPicker extends ConsumerStatefulWidget {
  /// What the written order must cover: [{product_id, quantity}] (the cart, or what a change adds)
  final List<Map<String, dynamic>> items;
  final String? value;
  final ValueChanged<String?> onChanged;
  /// The server refused the chosen one (e.g. not covering, too old, already used)
  final String? error;

  const WrittenOrderPicker({super.key, required this.items, required this.value, required this.onChanged, this.error});

  @override
  ConsumerState<WrittenOrderPicker> createState() => _WrittenOrderPickerState();
}

class _WrittenOrderPickerState extends ConsumerState<WrittenOrderPicker> {
  bool _upload = false;
  WrittenOrder? _made; // the one just signed or uploaded here, to describe it

  void _done(WrittenOrder wo) {
    _made = wo;
    ref.invalidate(myWrittenOrdersProvider);
    widget.onChanged(wo.id);
  }

  String _when(WrittenOrder w) => w.signedAt == null ? '' : ' · ${formatDateTimeIst(w.signedAt, zone: true)}';

  @override
  Widget build(BuildContext context) {
    final mine = ref.watch(myWrittenOrdersProvider).valueOrNull ?? const <WrittenOrder>[];
    final value = widget.value;
    if (value != null) {
      WrittenOrder? chosen = _made?.id == value ? _made : null;
      for (final w in mine) {
        if (w.id == value) chosen = w;
      }
      return Container(
        key: const ValueKey('written-order-chosen'),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.green.shade50,
          border: Border.all(color: Colors.green.shade200),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(Icons.assignment_turned_in_outlined, size: 18, color: Colors.green.shade900),
            const SizedBox(width: 8),
            Expanded(
              child: Text('Signed written order attached',
                  style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600, color: Colors.green.shade900)),
            ),
          ]),
          const SizedBox(height: 4),
          Text(chosen == null ? 'Ready to go with this order.' : '${chosen.uploaded ? 'Uploaded requisition' : 'Signed in the app'}${_when(chosen)}',
              style: TextStyle(fontSize: 12, color: Colors.green.shade900)),
          TextButton(onPressed: () => widget.onChanged(null), child: const Text('Use another')),
        ]),
      );
    }
    return Container(
      key: const ValueKey('written-order-picker'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF8E6),
        border: Border.all(color: Colors.amber.shade200),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Row(children: [
            Icon(Icons.assignment_outlined, size: 18, color: AppTheme.brandTeal700),
            SizedBox(width: 8),
            Expanded(child: Text('Signed written order needed', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700))),
          ]),
          const SizedBox(height: 4),
          Text(
            'Medicines are supplied to a doctor or medical institution only against a signed written order '
            '(Drugs Rules 1945, r.65(9)(b)).',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade800),
          ),
          if (widget.error != null) ...[
            const SizedBox(height: 8),
            Semantics(
              liveRegion: true,
              child: Text(widget.error!,
                  key: const ValueKey('written-order-error'), style: TextStyle(fontSize: 12.5, color: Colors.red.shade900)),
            ),
          ],
          if (mine.isNotEmpty) ...[
            const SizedBox(height: 10),
            const Text('Use one you made in the last 30 days', style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
            for (final w in mine)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: OutlinedButton(
                  key: ValueKey('wo-reuse-${w.id}'),
                  style: OutlinedButton.styleFrom(alignment: Alignment.centerLeft),
                  onPressed: () => widget.onChanged(w.id),
                  child: Text('${w.title}${_when(w)}', style: const TextStyle(fontSize: 12.5)),
                ),
              ),
          ],
          const SizedBox(height: 10),
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, label: Text('Sign here'), icon: Icon(Icons.draw_outlined, size: 16)),
              ButtonSegment(value: true, label: Text('Upload signed'), icon: Icon(Icons.upload_file_outlined, size: 16)),
            ],
            selected: {_upload},
            showSelectedIcon: false,
            onSelectionChanged: (s) => setState(() => _upload = s.first),
          ),
          const SizedBox(height: 10),
          if (_upload)
            WrittenOrderUploadPanel(onUploaded: _done)
          else
            WrittenOrderSignForm(items: widget.items, onSigned: _done),
        ],
      ),
    );
  }
}
