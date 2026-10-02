import 'package:flutter/material.dart';

import '../../../models/health_profile.dart';

/// Allergies, conditions and current medicines. The first save needs the consent
/// tick (never pre-ticked, C-41); its purpose is shown in the server's words.
class HealthProfileForm extends StatefulWidget {
  final HealthProfile profile;
  final void Function(bool? consent, List<String> allergies, List<String> conditions, List<String> medicines) onSave;
  const HealthProfileForm({super.key, required this.profile, required this.onSave});

  @override
  State<HealthProfileForm> createState() => _HealthProfileFormState();
}

class _HealthProfileFormState extends State<HealthProfileForm> {
  late final _allergies = TextEditingController(text: widget.profile.allergies.join('\n'));
  late final _conditions = TextEditingController(text: widget.profile.conditions.join('\n'));
  late final _medicines = TextEditingController(text: widget.profile.currentMedicines.join('\n'));
  bool _consent = false;

  @override
  void dispose() {
    _allergies.dispose();
    _conditions.dispose();
    _medicines.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.profile;
    final canSave = p.consentGiven || _consent;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('You', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            TextField(controller: _allergies, maxLines: 3, minLines: 1, decoration: const InputDecoration(labelText: 'Allergies (one per line)')),
            TextField(controller: _conditions, maxLines: 3, minLines: 1, decoration: const InputDecoration(labelText: 'Health conditions (one per line)')),
            TextField(controller: _medicines, maxLines: 3, minLines: 1, decoration: const InputDecoration(labelText: 'Medicines you take now (one per line)')),
            if (!p.consentGiven)
              CheckboxListTile(
                key: const ValueKey('health-consent'),
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: _consent,
                onChanged: (v) => setState(() => _consent = v ?? false),
                title: Text(p.consentPurpose, style: const TextStyle(fontSize: 13)),
              ),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: canSave
                    ? () => widget.onSave(p.consentGiven ? null : _consent, splitEntries(_allergies.text),
                        splitEntries(_conditions.text), splitEntries(_medicines.text))
                    : null,
                child: const Text('Save'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
