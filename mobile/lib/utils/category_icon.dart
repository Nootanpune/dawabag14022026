import 'package:flutter/material.dart';

/// Icon for a server category name. Categories are free text set by the
/// pharmacy, so this matches keywords and falls back to a generic icon.
const List<(List<String>, IconData)> _rules = [
  (['pain', 'fever', 'analges'], Icons.healing_outlined),
  (['antibiot', 'infect', 'antimicrob'], Icons.coronavirus_outlined),
  (['diabet', 'sugar', 'insulin'], Icons.bloodtype_outlined),
  (['cardi', 'heart', 'blood pressure', 'hypertens'], Icons.favorite_border),
  (['vitamin', 'supplement', 'nutri', 'mineral'], Icons.eco_outlined),
  (['skin', 'derma', 'cosmet'], Icons.face_retouching_natural_outlined),
  (['cold', 'cough', 'respir', 'asthma', 'allerg'], Icons.air),
  (['stomach', 'gastro', 'digest', 'acid', 'antacid'], Icons.lunch_dining_outlined),
  (['eye', 'ear', 'ophth'], Icons.visibility_outlined),
  (['baby', 'child', 'paediat', 'pediat', 'mother'], Icons.child_care_outlined),
  (['ayur', 'herbal', 'homeo'], Icons.spa_outlined),
  (['device', 'equipment', 'monitor', 'test'], Icons.monitor_heart_outlined),
  (['personal', 'hygiene', 'care'], Icons.clean_hands_outlined),
  (['neuro', 'psych', 'mental'], Icons.psychology_outlined),
];

IconData categoryIcon(String? category) {
  final c = (category ?? '').toLowerCase();
  for (final (keys, icon) in _rules) {
    if (keys.any(c.contains)) return icon;
  }
  return Icons.medication_outlined;
}
