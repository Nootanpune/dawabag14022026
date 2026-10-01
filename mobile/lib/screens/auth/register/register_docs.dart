import 'register_constants.dart';
import 'register_controller.dart';

/// KYC documents required / optional for the chosen customer type, and the
/// upload progress after OTP. Derived from the controller's in-memory state.
extension RegisterDocs on RegisterController {
  /// Required documents per the contract (plus anything the server asked for).
  List<String> get requiredDocs {
    final List<String> local;
    if (isRetailer) {
      local = [
        'drug_license',
        'pan_card',
        if (gstinCtrl.text.trim().isNotEmpty) 'gst_certificate',
      ];
    } else if (isWholesaler) {
      local = ['drug_license', 'gst_certificate', 'pan_card', 'cancelled_cheque'];
    } else if (isDoctor) {
      local = ['nmc_certificate', 'pan_card'];
    } else {
      local = [];
    }
    return [
      ...local,
      ...serverRequiredDocs.where((d) => !local.contains(d)),
    ];
  }

  List<String> get optionalDocs {
    if (!isDoctor) return const [];
    final reqDocs = requiredDocs;
    return ['clinic_address_proof'].where((d) => !reqDocs.contains(d)).toList();
  }

  List<String> get missingHeldDocs =>
      requiredDocs.where((d) => !files.containsKey(d)).toList();

  /// Rows on the upload screen: held files plus anything still missing.
  List<String> get uploadRows => [
        ...files.keys,
        ...?missingDocs?.where((d) => !files.containsKey(d)),
      ];

  bool get allUploadsDone =>
      files.keys.every((t) => uploadStatus[t] == UploadStatus.done) &&
      (missingDocs?.isEmpty ?? true);

  bool get anyUploading => uploadStatus.values.any((s) => s == UploadStatus.uploading);

  bool get anyFailed => uploadStatus.values.any((s) => s == UploadStatus.failed);
}
