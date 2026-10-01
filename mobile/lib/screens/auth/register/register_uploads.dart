import '../../../services/api_service.dart';
import '../../../services/registration_api.dart';
import 'register_constants.dart';
import 'register_controller.dart';

/// KYC document uploads after OTP (POST /kyc/documents, Bearer token).
extension RegisterUploads on RegisterController {
  Future<void> uploadAll() async {
    if (isUploadingAll) return;
    isUploadingAll = true;
    try {
      for (final type in files.keys.toList()) {
        if (isDisposed) return;
        if (uploadStatus[type] == UploadStatus.done) continue;
        await uploadOne(type);
      }
    } finally {
      isUploadingAll = false;
    }
  }

  Future<void> uploadOne(String type) async {
    final file = files[type];
    final path = file?.path;
    final token = authData?['access_token'] as String?;
    if (file == null || path == null) return;
    if (uploadStatus[type] == UploadStatus.uploading) return;

    update(() {
      uploadStatus[type] = UploadStatus.uploading;
      uploadError.remove(type);
    });
    try {
      final res = await apiService.uploadKycDocument(
        documentType: type,
        filePath: path,
        filename: file.name,
        accessToken: token,
      );
      if (isDisposed) return;
      final missing = res['missing_documents'];
      final kycStatus = res['kyc_status'];
      update(() {
        uploadStatus[type] = UploadStatus.done;
        if (missing is List) {
          missingDocs = missing.map((e) => e.toString()).toList();
        }
        final auth = authData;
        if (kycStatus is String && auth != null) {
          authData = {...auth, 'kyc_status': kycStatus};
        }
      });
    } catch (e) {
      update(() {
        uploadStatus[type] = UploadStatus.failed;
        uploadError[type] = ApiService.errorMessage(e, fallback: 'Upload failed');
      });
    }
  }
}
