import 'package:flutter/material.dart';

import '../../config/theme.dart';
import '../../utils/category_icon.dart';

/// Horizontally scrolling category tiles from GET /products/categories.
/// Tapping one filters the home product list; "All" clears the filter.
class CategoryTiles extends StatelessWidget {
  final List<String> categories;
  final String selected;
  final ValueChanged<String> onSelected;

  const CategoryTiles({
    super.key,
    required this.categories,
    required this.selected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 92,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _Tile(
            label: 'All',
            icon: Icons.apps_outlined,
            selected: selected.isEmpty,
            onTap: () => onSelected(''),
          ),
          for (final c in categories)
            _Tile(
              label: c,
              icon: categoryIcon(c),
              selected: selected == c,
              onTap: () => onSelected(c),
            ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _Tile({required this.label, required this.icon, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 10),
      child: Semantics(
        selected: selected,
        button: true,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: SizedBox(
            width: 76,
            child: Column(
              children: [
                AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: selected ? AppTheme.brandGreen : AppTheme.brandGreen50,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(icon, color: selected ? Colors.white : AppTheme.brandGreen700, size: 24),
                ),
                const SizedBox(height: 6),
                Text(label,
                    maxLines: 2,
                    textAlign: TextAlign.center,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 11,
                      height: 1.2,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                      color: selected ? AppTheme.brandGreen700 : Colors.grey.shade800,
                    )),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
