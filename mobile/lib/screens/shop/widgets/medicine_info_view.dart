import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/json_utils.dart';
import '../../../models/medicine_info.dart';
import '../../../utils/ist.dart';

/// "About this medicine" on the product screen (Sprint 33): one accordion per
/// section the pharmacist filled in (empty sections never arrive from the
/// server), then who reviewed it (C-19) and the standing disclaimer.
class MedicineInfoView extends StatelessWidget {
  final MedicineInfo info;
  const MedicineInfoView({super.key, required this.info});

  @override
  Widget build(BuildContext context) {
    if (!info.available || info.present.isEmpty) return const SizedBox.shrink();
    final sections = info.present;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 20),
        const Text('About this medicine', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        for (var i = 0; i < sections.length; i++)
          ExpansionTile(
            key: ValueKey('info-${sections[i].key}'),
            tilePadding: EdgeInsets.zero,
            childrenPadding: const EdgeInsets.only(bottom: 12),
            expandedCrossAxisAlignment: CrossAxisAlignment.start,
            initiallyExpanded: i == 0,
            title: Text(sections[i].label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            children: [InfoSectionBody(sectionKey: sections[i].key, value: info.sections[sections[i].key])],
          ),
        const SizedBox(height: 8),
        if (info.reviewerName != null)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.verified_outlined, size: 16, color: AppTheme.brandTeal),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  'Reviewed by ${info.reviewerName}, Reg. no. ${info.reviewerRegNo ?? '—'}'
                  '${info.reviewedAt != null ? ', on ${formatDateIst(info.reviewedAt!)}' : ''}',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                ),
              ),
            ],
          ),
        const SizedBox(height: 4),
        Text(info.disclaimer, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.grey.shade800)),
      ],
    );
  }
}

/// The body of one section, by its key.
class InfoSectionBody extends StatelessWidget {
  final String sectionKey;
  final Object? value;
  const InfoSectionBody({super.key, required this.sectionKey, required this.value});

  static const _text = TextStyle(fontSize: 14, height: 1.45);

  Widget _bullets(List<String> items) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [for (final x in items) Padding(padding: const EdgeInsets.only(bottom: 4), child: Text('•  $x', style: _text))],
      );

  Widget _group(String title, Object? items, {bool warn = false}) {
    final list = stringList(items);
    if (list.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: warn ? Colors.red.shade800 : null)),
        const SizedBox(height: 2),
        _bullets(list),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    switch (sectionKey) {
      case 'overview':
      case 'how_to_use':
      case 'how_it_works':
      case 'missed_dose':
        return Text(value?.toString() ?? '', style: _text);
      case 'uses':
      case 'quick_tips':
        return _bullets(stringList(value));
      case 'side_effects':
        final m = asMap(value);
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _group('Common', m['common']),
          _group('Serious', m['serious'], warn: true),
          _group('Contact your doctor if', m['contact_doctor_if'], warn: true),
        ]);
      case 'interactions':
        final m = asMap(value);
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          _group('With other medicines', m['medicines']),
          _group('With food', m['food']),
          _group('With health conditions', m['conditions']),
        ]);
      case 'safety':
        return Column(children: [for (final s in asMapList(value)) SafetyRow(item: s)]);
      case 'facts':
        final f = asMap(value);
        final rows = <(String, String)>[
          if (f['therapeutic_class'] != null) ('Therapeutic class', f['therapeutic_class'].toString()),
          if (f['chemical_class'] != null) ('Chemical class', f['chemical_class'].toString()),
          if (f['action_class'] != null) ('Action class', f['action_class'].toString()),
          if (f['habit_forming'] != null) ('Habit forming', f['habit_forming'] == true ? 'Yes' : 'No'),
        ];
        return Column(children: [
          for (final r in rows)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 3),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(width: 130, child: Text(r.$1, style: TextStyle(fontSize: 13, color: Colors.grey.shade600))),
                Expanded(child: Text(r.$2, style: const TextStyle(fontSize: 13))),
              ]),
            ),
        ]);
      case 'faqs':
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          for (final q in asMapList(value))
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(q['question']?.toString() ?? '', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text(q['answer']?.toString() ?? '', style: _text),
              ]),
            ),
        ]);
      case 'references':
        return _bullets(asMapList(value)
            .map((r) => [r['source'], r['date']].where((x) => x != null && x.toString().isNotEmpty).join(', '))
            .toList());
      default:
        return const SizedBox.shrink();
    }
  }
}

/// Alcohol / pregnancy / … with its level (Safe, Caution, Unsafe, Consult your doctor, Not known).
class SafetyRow extends StatelessWidget {
  final Map<String, dynamic> item;
  const SafetyRow({super.key, required this.item});

  static Color _bg(String level) => switch (level) {
        'safe' => Colors.green.shade100,
        'caution' => Colors.amber.shade100,
        'unsafe' => Colors.red.shade100,
        'consult_doctor' => Colors.blue.shade100,
        _ => Colors.grey.shade200,
      };

  @override
  Widget build(BuildContext context) {
    final note = item['note']?.toString();
    // Sprint 34: topic and level on one line (wrapping when the text is large),
    // the note underneath — fits 360 dp phones at 130 % text without overflow
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
          Text(item['label']?.toString() ?? '', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: _bg(item['level']?.toString() ?? ''), borderRadius: BorderRadius.circular(10)),
            child: Text(item['level_label']?.toString() ?? '', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
          ),
        ]),
        if (note != null && note.isNotEmpty)
          Padding(padding: const EdgeInsets.only(top: 2), child: Text(note, style: const TextStyle(fontSize: 13))),
      ]),
    );
  }
}
