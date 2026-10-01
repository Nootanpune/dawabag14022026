import 'package:intl/intl.dart';

String formatPrice(int paise) {
  final rupees = paise / 100;
  final formatter = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
  return formatter.format(rupees);
}

String discountPercent(int mrp, int offer) {
  if (mrp <= 0) return '0';
  return ((mrp - offer) / mrp * 100).round().toString();
}
