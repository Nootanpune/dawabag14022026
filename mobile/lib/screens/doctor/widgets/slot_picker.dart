import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../config/theme.dart';
import '../../../models/doctor.dart';
import '../../../providers/doctor_provider.dart';
import '../../../services/api_service.dart';
import '../../../utils/consult_format.dart';
import '../../../utils/ist.dart';

/// Number of days offered in the date strip.
const int kSlotDays = 14;

/// Date strip plus the open slots of the chosen day (GET /doctors/:id/slots).
/// Times are India time, as set by the doctor; the server only returns slots
/// that are still free and in the future.
class SlotPicker extends ConsumerWidget {
  final String doctorId;
  final DateTime day;
  final String? selectedSlotId;
  final ValueChanged<DateTime> onDayChanged;
  final ValueChanged<DoctorSlot> onSlotSelected;

  const SlotPicker({
    super.key,
    required this.doctorId,
    required this.day,
    required this.selectedSlotId,
    required this.onDayChanged,
    required this.onSlotSelected,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final today = todayIstDate();
    final days = List.generate(kSlotDays, (i) => DateTime(today.year, today.month, today.day + i));
    final query = (doctorId: doctorId, date: slotQueryDate(day));
    final slots = ref.watch(doctorSlotsProvider(query));

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 64,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: days.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (context, i) {
              final d = days[i];
              final selected = DateUtils.isSameDay(d, day);
              return InkWell(
                onTap: () => onDayChanged(d),
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  width: 56,
                  decoration: BoxDecoration(
                    color: selected ? AppTheme.brandTeal : Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: selected ? AppTheme.brandTeal : Colors.grey.shade300),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(DateFormat('EEE').format(d),
                          style: TextStyle(fontSize: 11, color: selected ? Colors.white70 : Colors.grey.shade600)),
                      const SizedBox(height: 2),
                      Text(DateFormat('d MMM').format(d),
                          style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: selected ? Colors.white : Colors.black87)),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 12),
        slots.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(child: CircularProgressIndicator(color: AppTheme.brandTeal)),
          ),
          error: (e, _) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(
              children: [
                Text(ApiService.errorMessage(e, fallback: 'Could not load slots'),
                    textAlign: TextAlign.center, style: const TextStyle(color: Colors.red, fontSize: 13)),
                TextButton(
                  onPressed: () => ref.invalidate(doctorSlotsProvider(query)),
                  child: const Text('Try again'),
                ),
              ],
            ),
          ),
          data: (list) => list.isEmpty
              ? Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Text('No free slots on ${DateFormat('d MMM').format(day)}. Try another day.',
                      style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
                )
              : Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: list
                      .map((s) => ChoiceChip(
                            label: Text(formatSlotTime(s.slotStart, zone: true)),
                            selected: s.id == selectedSlotId,
                            onSelected: (_) => onSlotSelected(s),
                            selectedColor: AppTheme.brandTeal100,
                          ))
                      .toList(),
                ),
        ),
        const SizedBox(height: 6),
        Text('Times are India time (IST).', style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
      ],
    );
  }
}
