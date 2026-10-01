import 'package:intl/intl.dart';

import '../services/api_service.dart';
import 'ist.dart';

/// Display helpers for teleconsultation screens. Slot dates and times are
/// India time (the server works in Asia/Kolkata); the IST maths lives in
/// ist.dart.

/// The calendar date of a server `slot_date` / `valid_until` value, read in
/// India time (see [istCalendarDay]).
DateTime? consultDay(String? raw) => istCalendarDay(raw);

/// 'Thu, 1 Oct 2026'
String formatConsultDay(String? raw) {
  final d = consultDay(raw);
  if (d == null) return raw ?? '';
  return DateFormat('EEE, d MMM yyyy').format(d);
}

/// 'HH:MM:SS' / 'HH:MM' → '10:30 AM' (slot times are India time); [zone]
/// appends ' IST'.
String formatSlotTime(String? hhmmss, {bool zone = false}) => formatClockTime(hhmmss, zone: zone);

/// 'YYYY-MM-DD' for the slots query.
String slotQueryDate(DateTime day) => calendarDayToApi(day);

/// API error text; the server may join several problems with '; ', which are
/// shown one per line.
String consultErrorMessage(Object error, {required String fallback}) =>
    ApiService.errorMessage(error, fallback: fallback).split('; ').join('\n');
