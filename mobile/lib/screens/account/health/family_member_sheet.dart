import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../models/health_profile.dart';

class FamilyMemberInput {
  final String name;
  final String relationship;
  final int? age;
  final List<String> allergies;
  final List<String> conditions;
  const FamilyMemberInput(this.name, this.relationship, this.age, this.allergies, this.conditions);
}

/// Name, relation, age and their own allergies / conditions. Null when cancelled.
Future<FamilyMemberInput?> showFamilyMemberSheet(BuildContext context, {FamilyMember? initial}) {
  return showModalBottomSheet<FamilyMemberInput>(
    context: context,
    isScrollControlled: true,
    builder: (_) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: FamilyMemberForm(initial: initial),
    ),
  );
}

class FamilyMemberForm extends StatefulWidget {
  final FamilyMember? initial;
  const FamilyMemberForm({super.key, this.initial});

  @override
  State<FamilyMemberForm> createState() => _FamilyMemberFormState();
}

class _FamilyMemberFormState extends State<FamilyMemberForm> {
  late final _name = TextEditingController(text: widget.initial?.name ?? '');
  late final _relation = TextEditingController(text: widget.initial?.relationship ?? '');
  late final _age = TextEditingController(text: widget.initial?.age?.toString() ?? '');
  late final _allergies = TextEditingController(text: (widget.initial?.allergies ?? const []).join('\n'));
  late final _conditions = TextEditingController(text: (widget.initial?.conditions ?? const []).join('\n'));

  @override
  void dispose() {
    for (final c in [_name, _relation, _age, _allergies, _conditions]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final age = int.tryParse(_age.text);
    final ok = _name.text.trim().length >= 2 && _relation.text.trim().length >= 2 && (_age.text.isEmpty || (age != null && age <= 120));
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Family member', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'Name'), onChanged: (_) => setState(() {})),
            TextField(controller: _relation, decoration: const InputDecoration(labelText: 'Relation, e.g. mother'), onChanged: (_) => setState(() {})),
            TextField(
              controller: _age,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: const InputDecoration(labelText: 'Age'),
              onChanged: (_) => setState(() {}),
            ),
            TextField(controller: _allergies, maxLines: 2, decoration: const InputDecoration(labelText: 'Allergies (one per line)')),
            TextField(controller: _conditions, maxLines: 2, decoration: const InputDecoration(labelText: 'Health conditions (one per line)')),
            const SizedBox(height: 12),
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: ok
                    ? () => Navigator.pop(context, FamilyMemberInput(_name.text.trim(), _relation.text.trim(),
                        _age.text.isEmpty ? null : age, splitEntries(_allergies.text), splitEntries(_conditions.text)))
                    : null,
                child: const Text('Save family member'),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}
