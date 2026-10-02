import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../providers/doctor_provider.dart';
import '../../widgets/error_retry_view.dart';
import 'widgets/doctor_card.dart';

/// /doctors — verified teleconsultation doctors (public; C-22). Each card
/// shows qualification, council and registration number as the Telemedicine
/// Practice Guidelines 2020 require. Always fetched from the server.
class DoctorListScreen extends ConsumerStatefulWidget {
  const DoctorListScreen({super.key});

  @override
  ConsumerState<DoctorListScreen> createState() => _DoctorListScreenState();
}

class _DoctorListScreenState extends ConsumerState<DoctorListScreen> {
  /// Specialities seen in the unfiltered list (in memory, for filter chips).
  final Set<String> _specialities = {};

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(doctorListProvider.notifier).load());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(doctorListProvider);
    final notifier = ref.read(doctorListProvider.notifier);
    if (state.speciality == null) {
      for (final d in state.doctors) {
        final s = d.speciality;
        if (s != null && s.isNotEmpty) _specialities.add(s);
      }
    }
    final specialities = _specialities.toList()..sort();

    Widget body;
    if (!state.loaded && state.isLoading) {
      body = const Center(child: CircularProgressIndicator(color: AppTheme.brandTeal));
    } else if (state.error != null && state.doctors.isEmpty) {
      body = ErrorRetryView(message: state.error!, onRetry: notifier.reload);
    } else {
      body = RefreshIndicator(
        color: AppTheme.brandTeal,
        onRefresh: notifier.reload,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Consult a registered doctor by video, audio or chat. Every doctor here has been '
              'checked against the National Medical Commission or State Medical Council register.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
            if (specialities.isNotEmpty) ...[
              const SizedBox(height: 10),
              SizedBox(
                height: 40,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    _FilterChip(
                      label: 'All',
                      selected: state.speciality == null,
                      onTap: () => notifier.load(),
                    ),
                    ...specialities.map((s) => _FilterChip(
                          label: s,
                          selected: state.speciality == s,
                          onTap: () => notifier.load(speciality: s),
                        )),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 12),
            if (state.isLoading) const LinearProgressIndicator(color: AppTheme.brandTeal),
            if (state.doctors.isEmpty && !state.isLoading)
              const _NoDoctors()
            else
              ...state.doctors.map((d) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: DoctorCard(doctor: d, onTap: () => context.push('/doctors/${d.id}')),
                  )),
            if (state.error != null && state.doctors.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text(state.error!,
                    textAlign: TextAlign.center, style: const TextStyle(color: Colors.red, fontSize: 13)),
              ),
            if (state.hasMore)
              Center(
                child: TextButton(
                  onPressed: state.isLoading ? null : notifier.loadMore,
                  child: const Text('Show more doctors'),
                ),
              ),
            const SizedBox(height: 24),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Consult a doctor'),
        actions: [
          IconButton(
            icon: const Icon(Icons.history),
            tooltip: 'My consultations',
            onPressed: () => context.push('/consultations'),
          ),
        ],
      ),
      body: body,
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _FilterChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          label: Text(label),
          selected: selected,
          onSelected: (_) => onTap(),
          selectedColor: AppTheme.brandTeal100,
        ),
      );
}

class _NoDoctors extends StatelessWidget {
  const _NoDoctors();

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              Icon(Icons.medical_services_outlined, size: 40, color: Colors.grey.shade400),
              const SizedBox(height: 10),
              const Text('No doctors available', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text(
                'Please check again later.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
            ],
          ),
        ),
      );
}
