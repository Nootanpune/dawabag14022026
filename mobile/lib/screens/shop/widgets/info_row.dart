import 'package:flutter/material.dart';

/// Label / value row on the product page. Renders nothing when the value is
/// missing or blank, so customers never see empty "—" rows.
class InfoRow extends StatelessWidget {
  final String label;
  final Object? value;
  const InfoRow(this.label, this.value, {super.key});

  static bool hasValue(Object? v) => v != null && v.toString().trim().isNotEmpty;

  @override
  Widget build(BuildContext context) {
    if (!hasValue(value)) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 128,
            child: Text(label, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
          ),
          Expanded(
            child: Text(value.toString().trim(),
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }
}

/// Titled group of [InfoRow]s; hidden entirely when every value is empty.
class InfoSection extends StatelessWidget {
  final String title;
  final List<InfoRow> rows;
  const InfoSection({super.key, required this.title, required this.rows});

  @override
  Widget build(BuildContext context) {
    if (!rows.any((r) => InfoRow.hasValue(r.value))) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: 28),
        Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
        const SizedBox(height: 10),
        ...rows,
      ],
    );
  }
}
