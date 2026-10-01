import 'package:intl/intl.dart';

/// India Standard Time helpers — the ONE place the app turns API dates and
/// instants into text, and works out "today". Dawabag operates only in India,
/// so every date/time shown or computed is IST (Asia/Kolkata, UTC+05:30, no
/// DST) whatever the phone's time zone is (owner decision, Sprint 20).
///
/// Rule: never call `.toLocal()` for display. An instant is shifted with
/// [toIst] (UTC + 5:30) and its fields are formatted as-is.

const String kIstZone = 'Asia/Kolkata';

/// India has a fixed UTC+05:30 offset (no daylight saving).
const Duration kIstOffset = Duration(hours: 5, minutes: 30);

final RegExp _dateOnly = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

final DateFormat _dateFmt = DateFormat('dd MMM yyyy');
final DateFormat _timeFmt = DateFormat('h:mm a');
final DateFormat _dateTimeFmt = DateFormat('dd MMM yyyy, h:mm a');
final DateFormat _ymd = DateFormat('yyyy-MM-dd');

/// The instant [d] as India wall-clock time. The result is a UTC DateTime
/// whose fields (year … minute) read as IST; format it, don't convert it.
DateTime toIst(DateTime d) => d.toUtc().add(kIstOffset);

/// Now as India wall-clock time (see [toIst]).
DateTime nowIst() => toIst(DateTime.now());

/// Today in India as a plain calendar day (midnight, fields only).
DateTime todayIstDate() {
  final n = nowIst();
  return DateTime(n.year, n.month, n.day);
}

/// Today in India as 'YYYY-MM-DD'.
String todayIst() => _ymd.format(todayIstDate());

/// Parses an API instant (ISO string). Returns null when empty or invalid.
DateTime? parseApiInstant(Object? raw) {
  if (raw is DateTime) return raw;
  final s = raw?.toString().trim() ?? '';
  if (s.isEmpty) return null;
  return DateTime.tryParse(s);
}

/// The calendar day of an API DATE value (`slot_date`, `valid_until` …).
/// A plain 'YYYY-MM-DD' is taken as-is and never shifted by a zone; a full
/// timestamp (a DATE serialised at midnight of some zone) is read in IST.
DateTime? istCalendarDay(Object? raw) {
  if (raw == null) return null;
  if (raw is DateTime) {
    final ist = toIst(raw);
    return DateTime(ist.year, ist.month, ist.day);
  }
  final s = raw.toString().trim();
  final m = _dateOnly.firstMatch(s);
  if (m != null) {
    return DateTime(int.parse(m.group(1)!), int.parse(m.group(2)!), int.parse(m.group(3)!));
  }
  final d = DateTime.tryParse(s);
  if (d == null) return null;
  final ist = toIst(d);
  return DateTime(ist.year, ist.month, ist.day);
}

/// '01 Oct 2026' — the India calendar day of an API date or instant. Falls
/// back to the raw text when it cannot be read, '' when empty.
String formatDateIst(Object? raw) {
  final d = istCalendarDay(raw);
  if (d == null) return raw?.toString() ?? '';
  return _dateFmt.format(d);
}

/// '01 Oct 2026, 2:05 PM' in India time; [zone] appends ' IST'.
String formatDateTimeIst(Object? raw, {bool zone = false}) {
  final d = parseApiInstant(raw);
  if (d == null) return raw?.toString() ?? '';
  final text = _dateTimeFmt.format(toIst(d));
  return zone ? '$text IST' : text;
}

/// '2:05 PM' in India time; [zone] appends ' IST'.
String formatTimeIst(Object? raw, {bool zone = false}) {
  final d = parseApiInstant(raw);
  if (d == null) return raw?.toString() ?? '';
  final text = _timeFmt.format(toIst(d));
  return zone ? '$text IST' : text;
}

/// A wall-clock time of day from the API ('14:30' / '14:30:00', already IST)
/// → '2:30 PM'; [zone] appends ' IST'.
String formatClockTime(String? hhmmss, {bool zone = false}) {
  if (hhmmss == null || hhmmss.length < 5) return hhmmss ?? '';
  final h = int.tryParse(hhmmss.substring(0, 2));
  final m = int.tryParse(hhmmss.substring(3, 5));
  if (h == null || m == null) return hhmmss;
  final text = _timeFmt.format(DateTime(2000, 1, 1, h, m));
  return zone ? '$text IST' : text;
}

/// A calendar day (from a date picker or [todayIstDate]) as 'YYYY-MM-DD'.
String calendarDayToApi(DateTime day) => _ymd.format(day);

/// True when an API DATE is today or later in India (no date → false).
bool isOnOrAfterTodayIst(Object? raw) {
  final d = istCalendarDay(raw);
  return d != null && !d.isBefore(todayIstDate());
}
