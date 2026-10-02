import 'json_utils.dart';

/// One substitute (Sprint 33): the same medicine from another maker. Shown for
/// the buyer to ask their doctor or pharmacist about — never swapped (C-08).
class Substitute {
  final Map<String, dynamic> raw;
  const Substitute(this.raw);

  String get id => asString(raw['id']) ?? '';
  String get name => asString(raw['name']) ?? '';
  String? get maker => asString(raw['maker']);
  String? get pack => asString(raw['net_quantity']);
  int get pricePaise => asInt(raw['display_price_paise']);
  int get perUnitPaise => asInt(raw['per_unit_paise']);
  String get unitLabel => asString(raw['unit_label']) ?? 'per pack';
  int? get savePct => raw['save_pct'] == null ? null : asInt(raw['save_pct']);
  bool get inStock => asBool(raw['in_stock']);
}

class SubstitutesResult {
  final String productName;
  final int productPerUnitPaise;
  final String productUnitLabel;
  final String note;
  final String consultHref;
  final int total;
  final List<Substitute> items;

  const SubstitutesResult({
    required this.productName,
    required this.productPerUnitPaise,
    required this.productUnitLabel,
    required this.note,
    required this.consultHref,
    required this.total,
    required this.items,
  });

  factory SubstitutesResult.fromJson(Map<String, dynamic> j) {
    final p = asMap(j['product']);
    return SubstitutesResult(
      productName: asString(p['name']) ?? '',
      productPerUnitPaise: asInt(p['per_unit_paise']),
      productUnitLabel: asString(p['unit_label']) ?? 'per pack',
      note: asString(j['note']) ?? kSubstituteNote,
      consultHref: asString(j['consult_href']) ?? '/consult',
      total: asInt(j['total']),
      items: asMapList(j['substitutes']).map(Substitute.new).toList(),
    );
  }
}

const String kSubstituteNote = 'Same medicine, different maker. Ask your doctor or pharmacist before switching.';

/// "₹2.00 per tablet"
String perUnitText(int paise, String unitLabel) => '₹${(paise / 100).toStringAsFixed(2)} $unitLabel';

/// "Get it by <weekday, date>" for a PIN code (Sprint 33) — always an estimate.
class DeliveryEstimate {
  final String? pincode;
  final bool needsPincode;
  final bool serviceable;
  final String? city;
  final String? label;
  final String? message;

  const DeliveryEstimate({this.pincode, this.needsPincode = false, this.serviceable = false, this.city, this.label, this.message});

  factory DeliveryEstimate.fromJson(Map<String, dynamic> j) => DeliveryEstimate(
        pincode: asString(j['pincode']),
        needsPincode: asBool(j['needs_pincode']),
        serviceable: asBool(j['serviceable']),
        city: asString(j['city']),
        label: asString(j['label']),
        message: asString(j['message']),
      );
}

/// A trust page (Sprint 33) as the server shows it.
class InfoPage {
  final String key;
  final String title;
  final String summary;
  final String body;
  final int version;

  const InfoPage({required this.key, required this.title, required this.summary, required this.body, required this.version});

  factory InfoPage.fromJson(Map<String, dynamic> j) => InfoPage(
        key: asString(j['page_key']) ?? '',
        title: asString(j['title']) ?? '',
        summary: asString(j['summary']) ?? '',
        body: asString(j['body']) ?? '',
        version: asInt(j['version'], 1),
      );
}

const List<(String, String)> kInfoPages = [
  ('genuine-medicines', 'Genuine medicines'),
  ('expired-damaged-recalled', 'Expired, damaged or recalled'),
  ('pharmacist-checked', 'Checked by a pharmacist'),
];
