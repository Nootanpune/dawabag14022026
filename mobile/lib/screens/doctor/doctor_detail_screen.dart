import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../models/doctor.dart';
import '../../providers/doctor_provider.dart';
import '../../services/api_service.dart';
import '../../utils/consult_format.dart';
import '../../utils/formatters.dart';
import '../../widgets/error_retry_view.dart';
import 'widgets/doctor_card.dart';
import 'widgets/slot_picker.dart';

/// /doctors/:id — a verified doctor's profile and registration (C-22) with
/// a slot picker by date. Booking needs sign-in (the router redirects).
class DoctorDetailScreen extends ConsumerStatefulWidget {
  final String doctorId;
  const DoctorDetailScreen({super.key, required this.doctorId});

  @override
  ConsumerState<DoctorDetailScreen> createState() => _DoctorDetailScreenState();
}

class _DoctorDetailScreenState extends ConsumerState<DoctorDetailScreen> {
  late DateTime _day = _today();
  DoctorSlot? _slot;

  static DateTime _today() {
    final now = DateTime.now();
    return DateTime(now.year, now.month, now.day);
  }

  void _reload() => ref.invalidate(doctorDetailProvider(widget.doctorId));

  void _book() {
    final slot = _slot;
    if (slot == null) return;
    final params = {
      'doctorId': widget.doctorId,
      'slotId': slot.id,
      'date': slotQueryDate(_day),
      'start': slot.slotStart,
    };
    context.push(Uri(path: '/consultations/book', queryParameters: params).toString());
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(doctorDetailProvider(widget.doctorId));

    return Scaffold(
      appBar: AppBar(title: Text(async.valueOrNull?.fullName ?? 'Doctor')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load this doctor'),
          onRetry: _reload,
        ),
        data: (d) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _ProfileCard(doctor: d),
            const SizedBox(height: 16),
            const Text('Choose a time', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            SlotPicker(
              doctorId: widget.doctorId,
              day: _day,
              selectedSlotId: _slot?.id,
              onDayChanged: (day) => setState(() {
                _day = day;
                _slot = null;
              }),
              onSlotSelected: (slot) => setState(() => _slot = slot),
            ),
            const SizedBox(height: 80),
          ],
        ),
      ),
      bottomNavigationBar: async.hasValue
          ? SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: ElevatedButton(
                  onPressed: _slot == null ? null : _book,
                  child: Text(_slot == null
                      ? 'Pick a slot to book'
                      : 'Book ${formatConsultDay(slotQueryDate(_day))}, ${formatSlotTime(_slot!.slotStart)}'),
                ),
              ),
            )
          : null,
    );
  }
}

class _ProfileCard extends StatelessWidget {
  final Doctor doctor;
  const _ProfileCard({required this.doctor});

  @override
  Widget build(BuildContext context) {
    final d = doctor;
    final grey = TextStyle(fontSize: 13, color: Colors.grey.shade700);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                DoctorAvatar(name: d.fullName, size: 56),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(d.fullName, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                      if (d.speciality != null && d.speciality!.isNotEmpty)
                        Text(d.speciality!, style: const TextStyle(fontSize: 13, color: AppTheme.brandGreen700)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            DoctorRegistrationText(qualification: d.qualification, registrationLine: d.registrationLine),
            if (d.clinicName != null && d.clinicName!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(d.clinicName!, style: grey),
            ],
            if (d.languages.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text('Speaks ${d.languages.join(', ')}', style: grey),
            ],
            if (d.bio != null && d.bio!.trim().isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(d.bio!.trim(), style: const TextStyle(fontSize: 13)),
            ],
            const Divider(height: 24),
            Row(
              children: [
                const Text('Consultation fee', style: TextStyle(fontSize: 13)),
                const Spacer(),
                Text(d.feePaise > 0 ? formatPrice(d.feePaise) : 'Free',
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
