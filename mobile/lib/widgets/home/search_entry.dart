import 'package:flutter/material.dart';

import '../../config/theme.dart';

/// Prominent search field on the home screen. Tapping it opens the Search
/// tab, where results are fetched from the server as the user types.
class SearchEntry extends StatelessWidget {
  final VoidCallback onTap;
  const SearchEntry({super.key, required this.onTap});

  // Generic example only: a brand named here may not be in the catalogue (Sprint 25)
  static const hint = 'Search medicines, e.g. paracetamol';

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: hint,
      child: Material(
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: AppTheme.brandTeal100, width: 1.5),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            child: Row(
              children: [
                const Icon(Icons.search, color: AppTheme.brandTeal, size: 22),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(hint,
                      style: TextStyle(fontSize: 15, color: Colors.grey.shade600),
                      overflow: TextOverflow.ellipsis),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
