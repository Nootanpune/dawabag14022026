import 'package:flutter/material.dart';

/// A titled card of label/value rows; rows with no value are skipped so the
/// screen shows only what the server returned.
class LegalSection extends StatelessWidget {
  final String title;
  final List<LegalRow> rows;
  final Widget? footer;
  const LegalSection({super.key, required this.title, required this.rows, this.footer});

  @override
  Widget build(BuildContext context) {
    final visible = rows.where((r) => r.value != null).toList();
    if (visible.isEmpty && footer == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              const SizedBox(height: 8),
              ...visible,
              if (footer != null) footer!,
            ],
          ),
        ),
      ),
    );
  }
}

class LegalRow extends StatelessWidget {
  final String label;
  final String? value;
  final VoidCallback? onTap;
  const LegalRow(this.label, this.value, {super.key, this.onTap});

  @override
  Widget build(BuildContext context) {
    final text = Text(
      value ?? '',
      style: TextStyle(
        fontSize: 13,
        color: onTap != null ? Theme.of(context).colorScheme.primary : null,
        decoration: onTap != null ? TextDecoration.underline : null,
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
          const SizedBox(height: 2),
          onTap != null ? InkWell(onTap: onTap, child: text) : SelectableText(value ?? '', style: const TextStyle(fontSize: 13)),
        ],
      ),
    );
  }
}
