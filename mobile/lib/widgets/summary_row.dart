import 'package:flutter/material.dart';

/// Label / value row used in price summaries (values are server amounts).
class SummaryRow extends StatelessWidget {
  final String label;
  final String value;
  final bool bold;
  final Color? valueColor;

  const SummaryRow(this.label, this.value, {super.key, this.bold = false, this.valueColor});

  @override
  Widget build(BuildContext context) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Flexible(
            child: Text(label,
                style: TextStyle(
                  fontSize: bold ? 15 : 13,
                  fontWeight: bold ? FontWeight.w700 : FontWeight.normal,
                  color: bold ? null : Colors.grey.shade600,
                )),
          ),
          const SizedBox(width: 12),
          Text(value,
              style: TextStyle(
                fontSize: bold ? 16 : 13,
                fontWeight: bold ? FontWeight.w700 : FontWeight.normal,
                color: valueColor,
              )),
        ],
      );
}
