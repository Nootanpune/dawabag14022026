import 'package:flutter/material.dart';

/// Sort order of the results; the server sorts ("Best match" = relevance).
const Map<String, String> kSearchSorts = {
  'relevance': 'Best match',
  'price_asc': 'Price: low to high',
  'price_desc': 'Price: high to low',
};

class SearchSortBar extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;
  const SearchSortBar({super.key, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
      child: Row(children: [
        for (final e in kSearchSorts.entries) ...[
          ChoiceChip(label: Text(e.value), selected: value == e.key, onSelected: (_) => onChanged(e.key)),
          const SizedBox(width: 8),
        ],
      ]),
    );
  }
}
