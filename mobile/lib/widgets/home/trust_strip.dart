import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';

/// Three small trust badges under the search field. They restate what the
/// pharmacy already does: a licensed seller (C-04), every order — with or
/// without prescription medicines — checked and released by a registered
/// pharmacist before packing (Sprint 35, C-08), and stock bought only from
/// licensed suppliers. Sprint 36: "Pharmacist-checked" opens the trust page
/// /trust/pharmacist-checked ("Every order is checked by a pharmacist"), as
/// the website's home page does.
class TrustStrip extends StatelessWidget {
  const TrustStrip({super.key});

  /// Trust page behind the "Pharmacist-checked" badge (server page key).
  static const pharmacistPage = '/trust/pharmacist-checked';

  static const _badges = [
    (Icons.verified_outlined, 'Licensed pharmacy', null, null),
    (Icons.medical_services_outlined, 'Pharmacist-checked', pharmacistPage, 'Pharmacist-checked: every order, before packing'),
    (Icons.inventory_2_outlined, 'Genuine stock', null, null),
  ];

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (var i = 0; i < _badges.length; i++) ...[
          if (i > 0) const SizedBox(width: 6),
          Expanded(
            child: _Badge(icon: _badges[i].$1, label: _badges[i].$2, path: _badges[i].$3, semantics: _badges[i].$4),
          ),
        ],
      ],
    );
  }
}

class _Badge extends StatelessWidget {
  final IconData icon;
  final String label;
  final String? path;
  final String? semantics;
  const _Badge({required this.icon, required this.label, this.path, this.semantics});

  @override
  Widget build(BuildContext context) {
    final badge = _box();
    final to = path;
    if (to == null) return badge;
    return Semantics(
      button: true,
      label: semantics ?? label,
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: () => context.push(to),
        child: badge,
      ),
    );
  }

  Widget _box() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
      decoration: BoxDecoration(
        color: AppTheme.brandTeal50,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 15, color: AppTheme.brandTeal700),
          const SizedBox(width: 4),
          Flexible(
            child: Text(label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 11, fontWeight: FontWeight.w600, color: AppTheme.brandTeal700)),
          ),
        ],
      ),
    );
  }
}
