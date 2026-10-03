import 'register_controller.dart';

/// POST /auth/register body built from the form (registration API contract).
extension RegisterPayload on RegisterController {
  Map<String, dynamic> buildPayload() {
    final type = customerType!;
    final email = emailCtrl.text.trim();
    final pincode = pincodeCtrl.text.trim();
    // Sprint 38 (C-20): doctors and hospitals have no referral field and send none
    final referral = isDoctor ? '' : referralCtrl.text.trim();
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
      'notice_language': noticeLanguage, // C-40
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
        // Sprint 44: a doctor, or an institution whose registration above is its responsible doctor's
        'practitioner_kind': practitionerKind,
        if (practitionerKind == 'institution') 'business_name': businessCtrl.text.trim(),
        'nmc_reg_number': nmcRegCtrl.text.trim(),
        'nmc_council_state': nmcCouncilCtrl.text.trim(),
        'speciality': speciality,
        'pan_number': pan,
        'gst_unregistered_declaration': gstDeclared,
        // C-15: buys only to treat own patients, never for resale
        'practitioner_declaration': practitionerDeclared,
      });
    }
    return payload;
  }
}
