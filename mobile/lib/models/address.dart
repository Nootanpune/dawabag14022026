import 'json_utils.dart';

/// A saved delivery address from GET /users/me/addresses. The server is the
/// only copy; screens rebuild this from [addressesProvider] after each change.
class Address {
  final String id;
  final String label;
  final String fullName;
  final String mobile;
  final String addressLine1;
  final String? addressLine2;
  final String city;
  final String state;
  final String pincode;
  final bool isDefault;

  /// From pincode serviceability; null when the pincode is not listed.
  final bool? isServiceable;
  final int? estimatedDays;

  const Address({
    required this.id,
    required this.label,
    required this.fullName,
    required this.mobile,
    required this.addressLine1,
    this.addressLine2,
    required this.city,
    required this.state,
    required this.pincode,
    this.isDefault = false,
    this.isServiceable,
    this.estimatedDays,
  });

  bool get canDeliver => isServiceable == true;

  String get oneLine {
    final line2 = addressLine2?.trim() ?? '';
    return '$addressLine1${line2.isEmpty ? '' : ', $line2'}, $city, $state — $pincode';
  }

  factory Address.fromJson(Map<String, dynamic> json) => Address(
        id: asString(json['id']) ?? '',
        label: asString(json['label']) ?? 'Home',
        fullName: asString(json['full_name']) ?? '',
        mobile: asString(json['mobile']) ?? '',
        addressLine1: asString(json['address_line1']) ?? '',
        addressLine2: asString(json['address_line2']),
        city: asString(json['city']) ?? '',
        state: asString(json['state']) ?? '',
        pincode: asString(json['pincode']) ?? '',
        isDefault: asBool(json['is_default']),
        isServiceable: json['is_serviceable'] == null ? null : asBool(json['is_serviceable']),
        estimatedDays: json['estimated_days'] == null ? null : asInt(json['estimated_days']),
      );
}

/// Body for POST / PUT /users/me/addresses (validated again by the server).
class AddressInput {
  final String label;
  final String fullName;
  final String mobile;
  final String addressLine1;
  final String? addressLine2;
  final String city;
  final String state;
  final String pincode;
  final bool isDefault;

  const AddressInput({
    required this.label,
    required this.fullName,
    required this.mobile,
    required this.addressLine1,
    this.addressLine2,
    required this.city,
    required this.state,
    required this.pincode,
    this.isDefault = false,
  });

  Map<String, dynamic> toJson() => {
        'label': label,
        'full_name': fullName,
        'mobile': mobile,
        'address_line1': addressLine1,
        'address_line2': (addressLine2 == null || addressLine2!.trim().isEmpty) ? null : addressLine2!.trim(),
        'city': city,
        'state': state,
        'pincode': pincode,
        'is_default': isDefault,
      };
}
