import 'json_utils.dart';

/// Side-effect (adverse drug reaction) reports, /api/v1/compliance/adverse-events
/// (C-29: reviewed by a pharmacist and forwarded to PvPI within the deadline).

const Map<String, String> kAdrSeriousness = {
  'non_serious': 'Not serious',
  'hospitalised': 'Needed hospital admission',
  'life_threatening': 'Life-threatening',
  'disability': 'Caused lasting disability',
  'death': 'Patient died',
  'other_serious': 'Other serious effect',
};

const Map<String, String> kAdrOutcomes = {
  'recovered': 'Recovered',
  'recovering': 'Recovering',
  'not_recovered': 'Not yet recovered',
  'fatal': 'Fatal',
  'unknown': 'Unknown',
};

const Map<String, String> kAdrGenders = {
  'female': 'Female',
  'male': 'Male',
  'other': 'Other',
};

String adrSeriousnessLabel(String s) => kAdrSeriousness[s] ?? s.replaceAll('_', ' ');

String adrStatusLabel(String status) {
  switch (status) {
    case 'new':
      return 'Received';
    case 'reviewed':
      return 'Reviewed by pharmacist';
    case 'forwarded':
      return 'Forwarded to PvPI';
    case 'closed':
      return 'Closed';
    default:
      return status.replaceAll('_', ' ');
  }
}

class AdverseEventReport {
  final String id;
  final String reportNo;
  final String? productName;
  final String? batchNumber;
  final String seriousness;
  final String status;
  final String? createdAt;

  const AdverseEventReport({
    required this.id,
    required this.reportNo,
    this.productName,
    this.batchNumber,
    required this.seriousness,
    required this.status,
    this.createdAt,
  });

  bool get isSerious => seriousness != 'non_serious';

  factory AdverseEventReport.fromJson(Map<String, dynamic> json) => AdverseEventReport(
        id: asString(json['id']) ?? '',
        reportNo: asString(json['report_no']) ?? '',
        productName: asString(json['product_name']),
        batchNumber: asString(json['batch_number']),
        seriousness: asString(json['seriousness']) ?? 'non_serious',
        status: asString(json['status']) ?? 'new',
        createdAt: asString(json['created_at']),
      );

  static List<AdverseEventReport> listFrom(Object? raw) =>
      asMapList(raw).map(AdverseEventReport.fromJson).toList();
}
