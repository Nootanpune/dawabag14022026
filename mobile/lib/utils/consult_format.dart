import 'package:intl/intl.dart';

import '../services/api_service.dart';

/// Display helpers for teleconsultation screens. Slot dates and times are
/// India time (the server works in Asia/Kolkata).

const Duration _istOffset = Duration(hours: 5, minutes: 30);

/// The calendar date of a server `slot_date` / `valid_until` value. The API
/// may send 'YYYY-MM-DD' or a full ISO timestamp (a Postgres DATE serialised
/// as UTC midnight of the server's zone); the timestamp is read in India time
/// so the day is right whatever the phone's time zone is.
DateTime? consultDay(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  try {
    if (raw.length == 10) {
      final d = DateTime.parse(raw);
      return DateTime(d.year, d.month, d.day);
    }
    final ist = DateTime.parse(raw).toUtc().add(_istOffset);
    return DateTime(ist.year, ist.month, ist.day);
  } catch (_) {
    return null;
  }
}

/// 'Thu, 1 Oct 2026'
String formatConsultDay(String? raw) {
  final d = consultDay(raw);
  if (d == null) return raw ?? '';
  return DateFormat('EEE, d MMM yyyy').format(d);
}

/// 'HH:MM:SS' / 'HH:MM' → '10:30 AM'
String formatSlotTime(String? hhmmss) {
  if (hhmmss == null || hhmmss.length < 5) return hhmmss ?? '';
  final h = int.tryParse(hhmmss.substring(0, 2));
  final m = int.tryParse(hhmmss.substring(3, 5));
  if (h == null || m == null) return hhmmss;
  return DateFormat('h:mm a').format(DateTime(2000, 1, 1, h, m));
}

/// 'YYYY-MM-DD' for the slots query.
String slotQueryDate(DateTime day) => DateFormat('yyyy-MM-dd').format(day);

/// API error text; the server may join several problems with '; ', which are
/// shown one per line.
String consultErrorMessage(Object error, {required String fallback}) =>
    ApiService.errorMessage(error, fallback: fallback).split('; ').join('\n');
