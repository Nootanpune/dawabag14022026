import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../../services/api_service.dart';
import '../../../services/registration_api.dart';
import '../../../services/upload_file.dart';
import '../../../widgets/otp_input.dart';
import 'register_constants.dart';
import 'register_docs.dart';
import 'register_payload.dart';
import 'register_otp.dart';
import 'register_uploads.dart';

/// State and logic of the 4-step registration flow. UI-free: the screen
/// supplies [verifyOtp] (auth provider), [onFinished] (sign-in + navigate)
/// and [onMessage] (snackbars). Nothing is stored on the device; picked files
/// are held in memory until they are uploaded after OTP.
class RegisterController extends ChangeNotifier {
  RegisterController({
    required this.verifyOtp,
    required this.onFinished,
    required this.onMessage,
  });

  final Future<Map<String, dynamic>> Function(String mobile, String otp) verifyOtp;
  final void Function(Map<String, dynamic> authData, String? message) onFinished;
  final void Function(String message, bool isError) onMessage;

  bool _disposed = false;

  RegisterStep step = RegisterStep.type;
  String? customerType;

  // Step 2
  final formKey = GlobalKey<FormState>();
  final nameCtrl = TextEditingController();
  final mobileCtrl = TextEditingController();
  final emailCtrl = TextEditingController();
  final passwordCtrl = TextEditingController();
  final confirmCtrl = TextEditingController();
  final pincodeCtrl = TextEditingController();
  final referralCtrl = TextEditingController();
  final businessCtrl = TextEditingController();
  final dlNumberCtrl = TextEditingController();
  final panCtrl = TextEditingController();
  final gstinCtrl = TextEditingController();
  final nmcRegCtrl = TextEditingController();
  final nmcCouncilCtrl = TextEditingController();
  String? dlType;
  String? speciality;
  bool gstDeclared = false;
  bool practitionerDeclared = false; // doctors: own patients only, not for resale (C-15)
  bool showPassword = false;

  // Consents (all customer types)
  /// Language the privacy notice is read in ('en' | 'mr' | 'hi'); the server
  /// records consent against that notice version and language (C-40).
  String noticeLanguage = 'en';
  bool acceptPrivacy = false;
  bool ageConfirmed = false;
  bool marketingConsent = false;

  // Register call
  bool isSubmitting = false;
  String? error;
  String? registeredMobile;
  List<String> serverRequiredDocs = const [];

  // Step 3 — files held in memory until OTP succeeds
  final Map<String, PlatformFile> files = {};

  // Step 4 — OTP
  final otpKey = GlobalKey<OtpInputState>();
  String otp = '';
  bool isVerifying = false;
  bool isResending = false;
  int resendIn = 0;
  Timer? resendTimer;

  // Step 4 — uploads (after OTP)
  Map<String, dynamic>? authData;
  final Map<String, UploadStatus> uploadStatus = {};
  final Map<String, String> uploadError = {};
  List<String>? missingDocs;
  bool isUploadingAll = false;

  @override
  void dispose() {
    _disposed = true;
    resendTimer?.cancel();
    for (final c in [nameCtrl, mobileCtrl, emailCtrl, passwordCtrl, confirmCtrl, pincodeCtrl,
        referralCtrl, businessCtrl, dlNumberCtrl, panCtrl, gstinCtrl, nmcRegCtrl, nmcCouncilCtrl]) {
      c.dispose();
    }
    super.dispose();
  }

  bool get isDisposed => _disposed;

  /// Applies [change] and rebuilds listeners (the setState equivalent).
  void update([VoidCallback? change]) {
    if (_disposed) return;
    change?.call();
    notifyListeners();
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  bool get isCustomer => customerType == 'customer';
  bool get isRetailer => customerType == 'b2b_retailer';
  bool get isWholesaler => customerType == 'b2b_wholesaler';
  bool get isDoctor => customerType == 'doc_hospital';
  bool get isB2B => isRetailer || isWholesaler;
  bool get isRegistered => registeredMobile != null;
  bool get isVerified => authData != null;

  List<RegisterStep> get visibleSteps => isCustomer
      ? const [RegisterStep.type, RegisterStep.details, RegisterStep.otp]
      : const [RegisterStep.type, RegisterStep.details, RegisterStep.documents, RegisterStep.otp];

  // ── Navigation ──────────────────────────────────────────────────────────────

  void goTo(RegisterStep next) => update(() {
        step = next;
        error = null;
      });

  /// Publishes the session (via [onFinished]) once verified.
  void finish({String? message}) {
    final data = authData;
    if (data == null) return;
    onFinished(data, message);
  }

  // ── Step 1 ──────────────────────────────────────────────────────────────────

  void selectType(String type) {
    if (type == customerType) return;
    update(() {
      customerType = type;
      dlType = null;
      speciality = null;
      gstDeclared = false;
      practitionerDeclared = false;
      files.clear();
    });
  }

  // ── Step 2 ──────────────────────────────────────────────────────────────────

  Future<void> submitDetails() async {
    update(() => error = null);
    if (!(formKey.currentState?.validate() ?? false)) return;

    if (isCustomer) {
      if (await register()) enterOtpStep();
    } else {
      // Drop files for documents that are no longer required (e.g. GSTIN cleared).
      final allowed = {...requiredDocs, ...optionalDocs};
      files.removeWhere((k, _) => !allowed.contains(k));
      goTo(RegisterStep.documents);
    }
  }

  /// POST /auth/register. Returns true on success.
  Future<bool> register() async {
    update(() {
      isSubmitting = true;
      error = null;
    });
    try {
      final data = await apiService.register(buildPayload());
      if (_disposed) return false;
      final serverDocs = data['required_documents'];
      update(() {
        registeredMobile = mobileCtrl.text.trim();
        serverRequiredDocs = serverDocs is List
            ? serverDocs.map((e) => e.toString()).toList()
            : const <String>[];
      });
      return true;
    } catch (e) {
      update(() => error = ApiService.errorMessage(e, fallback: 'Registration failed. Please try again.'));
      return false;
    } finally {
      update(() => isSubmitting = false);
    }
  }

  // ── Step 3 ──────────────────────────────────────────────────────────────────

  Future<void> pickFile(String docType, {bool uploadNow = false}) async {
    FilePickerResult? result;
    try {
      result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: kAllowedExtensions,
      );
    } catch (_) {
      onMessage('Could not open the file picker', true);
      return;
    }
    if (_disposed || result == null || result.files.isEmpty) return;

    final file = result.files.first;
    final ext = (file.extension ?? '').toLowerCase();
    if (!kAllowedExtensions.contains(ext)) {
      onMessage('Only PDF, JPG or PNG files are allowed', true);
      return;
    }
    if (file.size > kMaxFileBytes) {
      onMessage('${file.name} is larger than 5 MB', true);
      return;
    }
    if (file.path == null) {
      onMessage('Could not read ${file.name}', true);
      return;
    }
    // The file's bytes must be PDF / JPG / PNG (a HEIC photo named .jpg is refused
    // by the server — Sprint 35); say so now rather than after OTP
    try {
      await prepareUpload(file.path!, file.name);
    } on UploadRefused catch (e) {
      onMessage(e.message, true);
      return;
    }
    if (_disposed) return;

    update(() {
      files[docType] = file;
      uploadStatus.remove(docType);
      uploadError.remove(docType);
      error = null;
    });
    if (uploadNow) await uploadOne(docType);
  }

  void removeFile(String docType) => update(() => files.remove(docType));

  Future<void> submitDocuments() async {
    final missing = missingHeldDocs;
    if (missing.isNotEmpty) {
      update(() => error = 'Please add: ${missing.map(docLabel).join(', ')}');
      return;
    }
    if (!isRegistered) {
      if (!await register()) return;
      if (_disposed) return;
      // The server may require more than we computed locally.
      final stillMissing = missingHeldDocs;
      if (stillMissing.isNotEmpty) {
        update(() => error = 'Your account was created. Please also add: '
            '${stillMissing.map(docLabel).join(', ')}');
        return;
      }
    }
    enterOtpStep();
  }
}
