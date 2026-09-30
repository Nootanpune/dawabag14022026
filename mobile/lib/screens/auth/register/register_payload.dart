import 'register_controller.dart';

/// POST /auth/register body built from the form (registration API contract).
extension RegisterPayload on RegisterController {
  Map<String, dynamic> buildPayload() {
    final type = customerType!;
    final email = emailCtrl.text.trim();
    final pincode = pincodeCtrl.text.trim();
    final referral = referralCtrl.text.trim();
    final pan = panCtrl.text.trim().toUpperCase();
    final gstin = gstinCtrl.text.trim().toUpperCase();

    final payload = <String, dynamic>{
      'customer_type': type,
      'full_name': nameCtrl.text.trim(),
      'mobile': mobileCtrl.text.trim(),
      'password': passwordCtrl.text,
      if (email.isNotEmpty) 'email': email,
      if (pincode.isNotEmpty) 'pincode': pincode,
      if (referral.isNotEmpty) 'referral_code': referral.toUpperCase(),
      'accept_privacy_notice': acceptPrivacy,
      'age_confirmed': ageConfirmed,
      'marketing_consent': marketingConsent,
    };

    if (isRetailer) {
      payload.addAll({
        'business_name': businessCtrl.text.trim(),
        'drug_license_type': dlType,
        'drug_license_number': dlNumberCtrl.text.trim(),
        'pan_number': pan,
        if (gstin.isNotEmpty) 'gstin': gstin,
        'gst_unregistered_declaration': gstin.isEmpty && gstDeclared,
      });
    } else if (isWholesaler) {
      payload.addAll({
        'business_name': businessCtrl.text.trim(),
        'drug_license_type': dlType,
        'drug_license_number': dlNumberCtrl.text.trim(),
        'gstin': gstin,
        'pan_number': pan,
      });
    } else if (isDoctor) {
      payload.addAll({
        'nmc_reg_number': nmcRegCtrl.text.trim(),
        'nmc_council_state': nmcCouncilCtrl.text.trim(),
        'speciality': speciality,
        'pan_number': pan,
        'gst_unregistered_declaration': gstDeclared,
      });
    }
    return payload;
  }
}
