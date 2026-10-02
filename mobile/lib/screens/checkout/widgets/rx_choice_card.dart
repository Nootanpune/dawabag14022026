import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../utils/prescription_describe.dart';
import '../../../utils/prescription_status.dart';

/// Fetches a short-lived signed link to a prescription photo (C-41: every view
/// is logged on the server). Null in tests: a file icon is shown instead.
typedef RxLinkLoader = Future<String?> Function(String prescriptionId);

/// One of the buyer's prescriptions as a choice at checkout (radio card, as the
/// web's RxChoiceCard): picture, title, uploaded date and time, status, "Chosen".
class RxChoiceCard extends StatelessWidget {
  final Map<String, dynamic> rx;
  final bool selected;
  final VoidCallback onSelect;
  final RxLinkLoader? loadLink;

  const RxChoiceCard({super.key, required this.rx, required this.selected, required this.onSelect, this.loadLink});

  @override
  Widget build(BuildContext context) {
    final status = prescriptionStatus(rx);
    final ok = status.tone == RxTone.ok;
    return Semantics(
      inMutuallyExclusiveGroup: true,
      checked: selected,
      button: true,
      label: '${prescriptionTitle(rx)}, ${prescriptionUploaded(rx)}, ${status.label}',
      excludeSemantics: true,
      child: Material(
        color: selected ? AppTheme.brandGreen50 : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: selected ? AppTheme.brandGreen : Colors.grey.shade300, width: 2),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onSelect,
          child: Padding(
            padding: const EdgeInsets.all(10),
            child: Row(
              children: [
                _RxThumb(rx: rx, loadLink: loadLink),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(prescriptionTitle(rx), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                      Text(prescriptionUploaded(rx), style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
                      const SizedBox(height: 2),
                      Text(status.label,
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: ok ? Colors.green.shade800 : AppTheme.amberText)),
                    ],
                  ),
                ),
                if (selected)
                  const Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.check_circle, color: AppTheme.brandGreen),
                    Text('Chosen',
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.brandGreen700)),
                  ])
                else
                  Icon(Icons.radio_button_unchecked, color: Colors.grey.shade400),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A small picture of the buyer's own prescription photo, or a file icon.
class _RxThumb extends StatefulWidget {
  final Map<String, dynamic> rx;
  final RxLinkLoader? loadLink;
  const _RxThumb({required this.rx, this.loadLink});

  @override
  State<_RxThumb> createState() => _RxThumbState();
}

class _RxThumbState extends State<_RxThumb> {
  Future<String?>? _link;

  @override
  void initState() {
    super.initState();
    final load = widget.loadLink;
    final id = widget.rx['id']?.toString();
    if (load != null && id != null && isImagePrescription(widget.rx)) {
      _link = load(id).catchError((_) => null);
    }
  }

  @override
  Widget build(BuildContext context) {
    const icon = Icon(Icons.description_outlined, color: AppTheme.brandGreen, size: 26);
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        border: Border.all(color: Colors.grey.shade200),
        borderRadius: BorderRadius.circular(8),
      ),
      clipBehavior: Clip.antiAlias,
      child: _link == null
          ? const Center(child: icon)
          : FutureBuilder<String?>(
              future: _link,
              builder: (_, snap) {
                final url = snap.data;
                if (url == null) return const Center(child: icon);
                // Shown from the signed link only; never saved on the device (C-41)
                return Image.network(url,
                    fit: BoxFit.cover, errorBuilder: (_, __, ___) => const Center(child: icon));
              },
            ),
    );
  }
}
