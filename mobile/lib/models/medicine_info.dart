import 'json_utils.dart';

/// Medicine information for the product page (Sprint 33), written by Dawabag's
/// pharmacist from the manufacturer's package insert. The server sends only
/// the approved version (C-19) and leaves out empty sections; nothing is kept
/// on the phone.
class MedicineInfo {
  final bool available;
  final Map<String, dynamic> sections;
  final String? reviewerName;
  final String? reviewerRegNo;
  final DateTime? reviewedAt;
  final String disclaimer;

  const MedicineInfo({
    required this.available,
    this.sections = const {},
    this.reviewerName,
    this.reviewerRegNo,
    this.reviewedAt,
    this.disclaimer = kInfoDisclaimer,
  });

  factory MedicineInfo.fromJson(Map<String, dynamic> j) {
    final reviewed = asMap(j['reviewed']);
    return MedicineInfo(
      available: asBool(j['available']),
      sections: asMap(j['sections']),
      reviewerName: asString(reviewed['name']),
      reviewerRegNo: asString(reviewed['reg_no']),
      reviewedAt: DateTime.tryParse(reviewed['reviewed_at']?.toString() ?? ''),
      disclaimer: asString(j['disclaimer']) ?? kInfoDisclaimer,
    );
  }

  /// The sections the server sent, in page order.
  List<InfoSectionKey> get present => kInfoSections.where((s) => sections.containsKey(s.key)).toList();
}

const String kInfoDisclaimer = 'For information only. Follow your doctor’s advice.';

class InfoSectionKey {
  final String key;
  final String label;
  const InfoSectionKey(this.key, this.label);
}

/// Section order and buyer-facing names (same as the website).
const List<InfoSectionKey> kInfoSections = [
  InfoSectionKey('overview', 'Overview'),
  InfoSectionKey('uses', 'Uses'),
  InfoSectionKey('how_to_use', 'How to use'),
  InfoSectionKey('how_it_works', 'How it works'),
  InfoSectionKey('side_effects', 'Side effects'),
  InfoSectionKey('safety', 'Safety advice'),
  InfoSectionKey('missed_dose', 'Missed dose'),
  InfoSectionKey('interactions', 'Interactions'),
  InfoSectionKey('quick_tips', 'Quick tips'),
  InfoSectionKey('facts', 'Fact box'),
  InfoSectionKey('faqs', 'FAQs'),
  InfoSectionKey('references', 'References'),
];

/// Text list from a JSON value (non-empty strings only).
List<String> stringList(Object? v) =>
    v is List ? v.map((e) => e?.toString() ?? '').where((s) => s.trim().isNotEmpty).toList() : const [];
