import 'json_utils.dart';
import 'medicine_info.dart' show stringList;

/// Health profile (Sprint 33): kept on the server only with the buyer's
/// explicit consent (C-41); deletable any time (C-43, C-44).
class HealthProfile {
  final bool consentGiven;
  final String consentPurpose;
  final List<String> allergies;
  final List<String> conditions;
  final List<String> currentMedicines;
  final List<FamilyMember> family;

  const HealthProfile({
    required this.consentGiven,
    required this.consentPurpose,
    this.allergies = const [],
    this.conditions = const [],
    this.currentMedicines = const [],
    this.family = const [],
  });

  factory HealthProfile.fromJson(Map<String, dynamic> j) {
    final consent = asMap(j['consent']);
    return HealthProfile(
      consentGiven: asBool(consent['given']),
      consentPurpose: asString(consent['purpose']) ?? '',
      allergies: stringList(j['allergies']),
      conditions: stringList(j['conditions']),
      currentMedicines: stringList(j['current_medicines']),
      family: asMapList(j['family_members']).map(FamilyMember.fromJson).toList(),
    );
  }
}

class FamilyMember {
  final String id;
  final String name;
  final String? relationship;
  final int? age;
  final List<String> allergies;
  final List<String> conditions;

  const FamilyMember({required this.id, required this.name, this.relationship, this.age, this.allergies = const [], this.conditions = const []});

  factory FamilyMember.fromJson(Map<String, dynamic> j) => FamilyMember(
        id: asString(j['id']) ?? '',
        name: asString(j['full_name']) ?? '',
        relationship: asString(j['relationship']),
        age: j['age'] == null ? null : asInt(j['age']),
        allergies: stringList(j['allergies']),
        conditions: stringList(j['conditions']),
      );

  /// "mother · 64 years"
  String get subtitle => [relationship, if (age != null) '$age years'].whereType<String>().join(' · ');
}

/// "Penicillin, Sulpha drugs" or one per line → list
List<String> splitEntries(String text) =>
    text.split(RegExp(r'[\n,]')).map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
