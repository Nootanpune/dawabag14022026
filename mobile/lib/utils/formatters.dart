import 'package:intl/intl.dart';

String formatPrice(int paise) {
  final rupees = paise / 100;
  final formatter = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
  return formatter.format(rupees);
}

String formatDate(String iso) {
  try {
    final date = DateTime.parse(iso);
    return DateFormat('d MMM yyyy').format(date);
  } catch (_) {
    return iso;
  }
}

String formatDateTime(String iso) {
  try {
    final dt = DateTime.parse(iso).toLocal();
    return DateFormat('d MMM yyyy, h:mm a').format(dt);
  } catch (_) {
    return iso;
  }
}

String discountPercent(int mrp, int offer) {
  if (mrp <= 0) return '0';
  return ((mrp - offer) / mrp * 100).round().toString();
}
