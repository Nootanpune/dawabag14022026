import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../models/health_profile.dart';
import '../../../providers/health_profile_provider.dart';
import '../../../services/api_service.dart';
import '../../../services/health_profile_api.dart';
import '../../../widgets/error_retry_view.dart';
import 'family_member_sheet.dart';
import 'health_profile_form.dart';

/// Health profile (Sprint 33): allergies, conditions, current medicines and
/// family members, kept on the server only with the buyer's explicit consent
/// (C-41). Our pharmacists see it when they check an order (C-08). Delete any time (C-43, C-44).
class HealthProfileScreen extends ConsumerWidget {
  const HealthProfileScreen({super.key});

  Future<void> _run(BuildContext context, WidgetRef ref, Future<void> Function() action, String done) async {
    try {
      await action();
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ApiService.errorMessage(e, fallback: 'Could not save'))));
      }
    }
    ref.invalidate(healthProfileProvider);
  }

  Future<void> _member(BuildContext context, WidgetRef ref, [FamilyMember? m]) async {
    final v = await showFamilyMemberSheet(context, initial: m);
    if (v == null || !context.mounted) return;
    await _run(context, ref, () => apiService.saveFamilyMember(id: m?.id, name: v.name, relationship: v.relationship, age: v.age,
        allergies: v.allergies, conditions: v.conditions), 'Family member saved');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(healthProfileProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Health profile')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandTeal)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load your health profile'),
          onRetry: () => ref.invalidate(healthProfileProvider),
        ),
        data: (p) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('Optional. Our pharmacists see it when they check your prescriptions and orders, so they can spot an allergy '
                'or a clash with another medicine.', style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
            const SizedBox(height: 12),
            HealthProfileForm(
              key: ValueKey('${p.consentGiven}-${p.allergies.join('|')}-${p.conditions.join('|')}'),
              profile: p,
              onSave: (consent, allergies, conditions, medicines) => _run(context, ref, () => apiService.saveHealthProfile(
                  consent: consent, allergies: allergies, conditions: conditions, currentMedicines: medicines), 'Health profile saved'),
            ),
            const SizedBox(height: 16),
            Row(children: [
              const Expanded(child: Text('Family members', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700))),
              if (p.consentGiven) TextButton.icon(onPressed: () => _member(context, ref), icon: const Icon(Icons.person_add_alt), label: const Text('Add')),
            ]),
            if (!p.consentGiven) Text('Save your health profile with the consent tick first.', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            for (final m in p.family)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(m.name),
                subtitle: Text([m.subtitle, if (m.allergies.isNotEmpty) 'Allergies: ${m.allergies.join(', ')}'].where((s) => s.isNotEmpty).join('\n')),
                onTap: () => _member(context, ref, m),
                trailing: IconButton(
                  tooltip: 'Remove ${m.name}',
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => _run(context, ref, () => apiService.removeFamilyMember(m.id), 'Removed'),
                ),
              ),
            if (p.consentGiven) ...[
              const Divider(height: 32),
              Text('Deleting removes your allergies, conditions, medicines and family members’ health details, and withdraws your consent.',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
              TextButton(
                onPressed: () async {
                  final ok = await showDialog<bool>(
                    context: context,
                    builder: (c) => AlertDialog(
                      title: const Text('Delete your health profile?'),
                      actions: [
                        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
                        TextButton(onPressed: () => Navigator.pop(c, true), child: const Text('Delete', style: TextStyle(color: Colors.red))),
                      ],
                    ),
                  );
                  if (ok == true && context.mounted) await _run(context, ref, () => apiService.deleteHealthProfile(), 'Health profile deleted');
                },
                child: const Text('Delete my health profile', style: TextStyle(color: Colors.red)),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
