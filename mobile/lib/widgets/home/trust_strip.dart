import 'package:flutter/material.dart';

import '../../config/theme.dart';

/// Three small trust badges under the search field. They restate what the
/// pharmacy already does: a licensed seller (C-04), every prescription order
/// checked by a registered pharmacist before dispatch (C-08), and stock bought
/// only from licensed suppliers.
class TrustStrip extends StatelessWidget {
  const TrustStrip({super.key});

  static const _badges = [
    (Icons.verified_outlined, 'Licensed pharmacy'),
    (Icons.medical_services_outlined, 'Pharmacist-checked'),
    (Icons.inventory_2_outlined, 'Genuine stock'),
  ];

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < _badges.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(child: _Badge(icon: _badges[i].$1, label: _badges[i].$2)),
        ],
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  final IconData icon;
  final String label;
  const _Badge({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
      decoration: BoxDecoration(
        color: AppTheme.brandGreen50,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 15, color: AppTheme.brandGreen700),
          const SizedBox(width: 4),
          Flexible(
            child: Text(label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.brandGreen700)),
          ),
        ],
      ),
    );
  }
}
