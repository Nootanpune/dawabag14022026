import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../config/theme.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../widgets/otp_input.dart';

// ── Reference data (see registration API contract) ────────────────────────────

class _CustomerTypeOption {
  final String value;
  final String label;
  final String description;
  final String kycNote;
  final IconData icon;

  const _CustomerTypeOption({
    required this.value,
    required this.label,
    required this.description,
    required this.kycNote,
    required this.icon,
  });
}

const List<_CustomerTypeOption> _customerTypes = [
  _CustomerTypeOption(
    value: 'customer',
    label: 'Patient / Individual (B2C)',
    description: 'Order medicines for yourself and your family at offer prices.',
    kycNote: 'No verification needed — start shopping right after OTP',
    icon: Icons.person_outline,
  ),
  _CustomerTypeOption(
    value: 'b2b_retailer',
    label: 'Retail Pharmacy / Hospital Pharmacy',
    description: 'Buy stock at PTR (price to retailer).',
    kycNote: 'KYC review: 1–2 working days',
    icon: Icons.local_pharmacy_outlined,
  ),
  _CustomerTypeOption(
    value: 'b2b_wholesaler',
    label: 'Wholesaler / Distributor / Stockist',
    description: 'Buy stock at PTS (price to stockist).',
    kycNote: 'KYC review: 2–3 working days',
    icon: Icons.local_shipping_outlined,
  ),
  _CustomerTypeOption(
    value: 'doc_hospital',
    label: 'Doctor (NMC / State Medical Council reg.)',
    description: 'Institutional pricing for your clinic or hospital.',
    kycNote: 'KYC review: 1–2 working days',
    icon: Icons.medical_services_outlined,
  ),
];

const Map<String, String> _retailerDlTypes = {
  'dl20': 'Form 20 (DL-20)',
  'dl21': 'Form 21 (DL-21)',
};

const Map<String, String> _wholesalerDlTypes = {
  'dl20c': 'Form 20C (DL-20C)',
  'dl21c': 'Form 21C (DL-21C)',
};

const List<String> _specialities = [
  'General Physician',
  'Diabetologist',
  'Cardiologist',
  'Paediatrician',
  'Gynaecologist',
  'Dermatologist',
  'Orthopaedic',
  'ENT',
  'Other',
];

const Map<String, String> _documentLabels = {
  'drug_license': 'Drug licence',
  'pan_card': 'PAN card',
  'gst_certificate': 'GST registration certificate',
  'cancelled_cheque': 'Cancelled cheque',
  'nmc_certificate': 'NMC / State Medical Council registration certificate',
  'clinic_address_proof': 'Clinic address proof',
};

String _docLabel(String type) => _documentLabels[type] ?? type;

const List<String> _allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
const int _maxFileBytes = 5 * 1024 * 1024;

final RegExp _mobileRe = RegExp(r'^[6-9]\d{9}$');
final RegExp _panRe = RegExp(r'^[A-Z]{5}[0-9]{4}[A-Z]$');
final RegExp _gstinRe = RegExp(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
final RegExp _pincodeRe = RegExp(r'^[1-9][0-9]{5}$');
final RegExp _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

enum _Step { type, details, documents, otp, submitted }

enum _UploadStatus { pending, uploading, done, failed }

const Map<_Step, String> _stepLabels = {
  _Step.type: 'Type',
  _Step.details: 'Details',
  _Step.documents: 'Documents',
  _Step.otp: 'Verify',
};

class _UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) =>
      newValue.copyWith(text: newValue.text.toUpperCase());
}

// ── Screen ────────────────────────────────────────────────────────────────────

/// 4-step registration:
/// 1. customer type → 2. details (POST /auth/register for customers)
/// → 3. documents (B2B / doctor only; POST /auth/register on continue)
/// → 4. OTP verify, then KYC document upload → application submitted.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  _Step _step = _Step.type;
  String? _customerType;

  // Step 2
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _mobileCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  final _pincodeCtrl = TextEditingController();
  final _referralCtrl = TextEditingController();
  final _businessCtrl = TextEditingController();
  final _dlNumberCtrl = TextEditingController();
  final _panCtrl = TextEditingController();
  final _gstinCtrl = TextEditingController();
  final _nmcRegCtrl = TextEditingController();
  final _nmcCouncilCtrl = TextEditingController();
  String? _dlType;
  String? _speciality;
  bool _gstDeclared = false;
  bool _showPassword = false;

  // Register call
  bool _isSubmitting = false;
  String? _error;
  String? _registeredMobile;
  List<String> _serverRequiredDocs = const [];

  // Step 3 — files held locally until OTP succeeds
  final Map<String, PlatformFile> _files = {};

  // Step 4 — OTP
  final _otpKey = GlobalKey<OtpInputState>();
  String _otp = '';
  bool _isVerifying = false;
  bool _isResending = false;
  int _resendIn = 0;
  Timer? _resendTimer;

  // Step 4 — uploads (after OTP)
  Map<String, dynamic>? _authData;
  final Map<String, _UploadStatus> _uploadStatus = {};
  final Map<String, String> _uploadError = {};
  List<String>? _missingDocs;
  bool _isUploadingAll = false;

  @override
  void dispose() {
    _resendTimer?.cancel();
    for (final c in [
      _nameCtrl, _mobileCtrl, _emailCtrl, _passwordCtrl, _confirmCtrl,
      _pincodeCtrl, _referralCtrl, _businessCtrl, _dlNumberCtrl, _panCtrl,
      _gstinCtrl, _nmcRegCtrl, _nmcCouncilCtrl,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  bool get _isCustomer => _customerType == 'customer';
  bool get _isRetailer => _customerType == 'b2b_retailer';
  bool get _isWholesaler => _customerType == 'b2b_wholesaler';
  bool get _isDoctor => _customerType == 'doc_hospital';
  bool get _isB2B => _isRetailer || _isWholesaler;
  bool get _isRegistered => _registeredMobile != null;
  bool get _isVerified => _authData != null;

  List<_Step> get _visibleSteps => _isCustomer
      ? const [_Step.type, _Step.details, _Step.otp]
      : const [_Step.type, _Step.details, _Step.documents, _Step.otp];

  /// Required documents per the contract (plus anything the server asked for).
  List<String> get _requiredDocs {
    final List<String> local;
    if (_isRetailer) {
      local = [
        'drug_license',
        'pan_card',
        if (_gstinCtrl.text.trim().isNotEmpty) 'gst_certificate',
      ];
    } else if (_isWholesaler) {
      local = ['drug_license', 'gst_certificate', 'pan_card', 'cancelled_cheque'];
    } else if (_isDoctor) {
      local = ['nmc_certificate', 'pan_card'];
    } else {
      local = [];
    }
    return [
      ...local,
      ..._serverRequiredDocs.where((d) => !local.contains(d)),
    ];
  }

  List<String> get _optionalDocs {
    if (!_isDoctor) return const [];
    final requiredDocs = _requiredDocs;
    return ['clinic_address_proof'].where((d) => !requiredDocs.contains(d)).toList();
  }

  List<String> get _missingHeldDocs =>
      _requiredDocs.where((d) => !_files.containsKey(d)).toList();

  // ── Navigation ──────────────────────────────────────────────────────────────

  void _goTo(_Step step) {
    setState(() {
      _step = step;
      _error = null;
    });
  }

  /// Returns true when the back press was handled inside the flow.
  Future<bool> _handleBack() async {
    if (_isSubmitting || _isVerifying) return true;
    if (_step == _Step.type) return false;
    if (_step == _Step.details) {
      _goTo(_Step.type);
    } else if (_step == _Step.documents) {
      if (_isRegistered) {
        await _confirmLeave();
      } else {
        _goTo(_Step.details);
      }
    } else if (_step == _Step.otp) {
      // Once verified the account is live; the user can only submit or skip.
      if (!_isVerified) {
        if (_isCustomer) {
          await _confirmLeave();
        } else {
          _goTo(_Step.documents);
        }
      }
    } else if (_step == _Step.submitted) {
      _finish();
    }
    return true;
  }

  Future<void> _onAppBarBack() async {
    final handled = await _handleBack();
    if (handled || !mounted) return;
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/auth/login');
    }
  }

  Future<void> _confirmLeave() async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave registration?'),
        content: const Text(
          'Your account has been created but your mobile number is not verified yet. '
          'You can verify it later by signing in with your mobile number and password.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Stay')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Leave')),
        ],
      ),
    );
    if (leave != true || !mounted) return;
    context.go('/auth/login');
  }

  /// Publishes the session to the auth provider and goes home.
  void _finish({String? message}) {
    final data = _authData;
    if (data == null) return;
    final messenger = ScaffoldMessenger.of(context);
    ref.read(authProvider.notifier).completeSignIn(data);
    context.go('/');
    if (message != null) {
      messenger.showSnackBar(SnackBar(content: Text(message)));
    }
  }

  // ── Step 1 ──────────────────────────────────────────────────────────────────

  void _selectType(String type) {
    if (type == _customerType) return;
    setState(() {
      _customerType = type;
      _dlType = null;
      _speciality = null;
      _gstDeclared = false;
      _files.clear();
    });
  }

  // ── Step 2 ──────────────────────────────────────────────────────────────────

  Future<void> _onDetailsContinue() async {
    FocusScope.of(context).unfocus();
    setState(() => _error = null);
    if (!(_formKey.currentState?.validate() ?? false)) return;

    if (_isCustomer) {
      if (await _register()) _enterOtpStep();
    } else {
      // Drop files for documents that are no longer required (e.g. GSTIN cleared).
      final allowed = {..._requiredDocs, ..._optionalDocs};
      setState(() => _files.removeWhere((k, _) => !allowed.contains(k)));
      _goTo(_Step.documents);
    }
  }

  Map<String, dynamic> _buildPayload() {
    final type = _customerType!;
    final email = _emailCtrl.text.trim();
    final pincode = _pincodeCtrl.text.trim();
    final referral = _referralCtrl.text.trim();
    final pan = _panCtrl.text.trim().toUpperCase();
    final gstin = _gstinCtrl.text.trim().toUpperCase();

    final payload = <String, dynamic>{
      'customer_type': type,
      'full_name': _nameCtrl.text.trim(),
      'mobile': _mobileCtrl.text.trim(),
      'password': _passwordCtrl.text,
      if (email.isNotEmpty) 'email': email,
      if (pincode.isNotEmpty) 'pincode': pincode,
      if (referral.isNotEmpty) 'referral_code': referral.toUpperCase(),
    };

    if (_isRetailer) {
      payload.addAll({
        'business_name': _businessCtrl.text.trim(),
        'drug_license_type': _dlType,
        'drug_license_number': _dlNumberCtrl.text.trim(),
        'pan_number': pan,
        if (gstin.isNotEmpty) 'gstin': gstin,
        'gst_unregistered_declaration': gstin.isEmpty && _gstDeclared,
      });
    } else if (_isWholesaler) {
      payload.addAll({
        'business_name': _businessCtrl.text.trim(),
        'drug_license_type': _dlType,
        'drug_license_number': _dlNumberCtrl.text.trim(),
        'gstin': gstin,
        'pan_number': pan,
      });
    } else if (_isDoctor) {
      payload.addAll({
        'nmc_reg_number': _nmcRegCtrl.text.trim(),
        'nmc_council_state': _nmcCouncilCtrl.text.trim(),
        'speciality': _speciality,
        'pan_number': pan,
        'gst_unregistered_declaration': _gstDeclared,
      });
    }
    return payload;
  }

  /// POST /auth/register. Returns true on success.
  Future<bool> _register() async {
    setState(() {
      _isSubmitting = true;
      _error = null;
    });
    try {
      final data = await apiService.register(_buildPayload());
      if (!mounted) return false;
      final serverDocs = data['required_documents'];
      setState(() {
        _registeredMobile = _mobileCtrl.text.trim();
        _serverRequiredDocs = serverDocs is List
            ? serverDocs.map((e) => e.toString()).toList()
            : const <String>[];
      });
      return true;
    } catch (e) {
      if (mounted) {
        setState(() => _error = ApiService.errorMessage(e, fallback: 'Registration failed. Please try again.'));
      }
      return false;
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  // ── Step 3 ──────────────────────────────────────────────────────────────────

  Future<void> _pickFile(String docType, {bool uploadNow = false}) async {
    FilePickerResult? result;
    try {
      result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: _allowedExtensions,
      );
    } catch (_) {
      _snack('Could not open the file picker', error: true);
      return;
    }
    if (!mounted || result == null || result.files.isEmpty) return;

    final file = result.files.first;
    final ext = (file.extension ?? '').toLowerCase();
    if (!_allowedExtensions.contains(ext)) {
      _snack('Only PDF, JPG or PNG files are allowed', error: true);
      return;
    }
    if (file.size > _maxFileBytes) {
      _snack('${file.name} is larger than 5 MB', error: true);
      return;
    }
    if (file.path == null) {
      _snack('Could not read ${file.name}', error: true);
      return;
    }

    setState(() {
      _files[docType] = file;
      _uploadStatus.remove(docType);
      _uploadError.remove(docType);
      _error = null;
    });
    if (uploadNow) await _uploadOne(docType);
  }

  Future<void> _onDocumentsContinue() async {
    final missing = _missingHeldDocs;
    if (missing.isNotEmpty) {
      setState(() => _error = 'Please add: ${missing.map(_docLabel).join(', ')}');
      return;
    }
    if (!_isRegistered) {
      if (!await _register()) return;
      if (!mounted) return;
      // The server may require more than we computed locally.
      final stillMissing = _missingHeldDocs;
      if (stillMissing.isNotEmpty) {
        setState(() => _error = 'Your account was created. Please also add: '
            '${stillMissing.map(_docLabel).join(', ')}');
        return;
      }
    }
    _enterOtpStep();
  }

  // ── Step 4: OTP ─────────────────────────────────────────────────────────────

  void _enterOtpStep() {
    final firstTime = _resendTimer == null;
    _goTo(_Step.otp);
    if (firstTime) _startResendTimer();
  }

  void _startResendTimer() {
    _resendTimer?.cancel();
    setState(() => _resendIn = 30);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_resendIn <= 1) {
        t.cancel();
        setState(() => _resendIn = 0);
      } else {
        setState(() => _resendIn--);
      }
    });
  }

  Future<void> _resendOtp() async {
    final mobile = _registeredMobile;
    if (mobile == null) return;
    setState(() => _isResending = true);
    try {
      await apiService.sendOtp(mobile);
      if (!mounted) return;
      _startResendTimer();
      _snack('OTP sent to +91 $mobile');
    } catch (e) {
      _snack(ApiService.errorMessage(e, fallback: 'Could not resend OTP'), error: true);
    } finally {
      if (mounted) setState(() => _isResending = false);
    }
  }

  Future<void> _verifyOtp() async {
    final mobile = _registeredMobile;
    if (mobile == null || _otp.length != 6 || _isVerifying) return;
    setState(() {
      _isVerifying = true;
      _error = null;
    });
    try {
      final data = await ref
          .read(authProvider.notifier)
          .verifyOTPAndSaveTokens(mobile, _otp);
      if (!mounted) return;
      _resendTimer?.cancel();
      setState(() => _authData = data);

      if (_isCustomer) {
        _finish(message: 'Welcome to Dawabag!');
        return;
      }
      setState(() {
        for (final type in _files.keys) {
          _uploadStatus[type] = _UploadStatus.pending;
        }
      });
      await _uploadAll();
    } catch (e) {
      if (!mounted) return;
      _otpKey.currentState?.clear();
      setState(() => _error = ApiService.errorMessage(e, fallback: 'Invalid OTP. Try again.'));
    } finally {
      if (mounted) setState(() => _isVerifying = false);
    }
  }

  // ── Step 4: uploads ─────────────────────────────────────────────────────────

  Future<void> _uploadAll() async {
    if (_isUploadingAll) return;
    _isUploadingAll = true;
    try {
      for (final type in _files.keys.toList()) {
        if (!mounted) return;
        if (_uploadStatus[type] == _UploadStatus.done) continue;
        await _uploadOne(type);
      }
    } finally {
      _isUploadingAll = false;
    }
  }

  Future<void> _uploadOne(String type) async {
    final file = _files[type];
    final path = file?.path;
    final token = _authData?['access_token'] as String?;
    if (file == null || path == null) return;
    if (_uploadStatus[type] == _UploadStatus.uploading) return;

    setState(() {
      _uploadStatus[type] = _UploadStatus.uploading;
      _uploadError.remove(type);
    });
    try {
      final res = await apiService.uploadKycDocument(
        documentType: type,
        filePath: path,
        filename: file.name,
        accessToken: token,
      );
      if (!mounted) return;
      final missing = res['missing_documents'];
      final kycStatus = res['kyc_status'];
      setState(() {
        _uploadStatus[type] = _UploadStatus.done;
        if (missing is List) {
          _missingDocs = missing.map((e) => e.toString()).toList();
        }
        final auth = _authData;
        if (kycStatus is String && auth != null) {
          _authData = {...auth, 'kyc_status': kycStatus};
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _uploadStatus[type] = _UploadStatus.failed;
        _uploadError[type] = ApiService.errorMessage(e, fallback: 'Upload failed');
      });
    }
  }

  /// Rows shown on the upload screen: held files plus anything the server
  /// still reports as missing.
  List<String> get _uploadRows => [
        ..._files.keys,
        ...?_missingDocs?.where((d) => !_files.containsKey(d)),
      ];

  bool get _allUploadsDone =>
      _files.keys.every((t) => _uploadStatus[t] == _UploadStatus.done) &&
      (_missingDocs?.isEmpty ?? true);

  bool get _anyUploading =>
      _uploadStatus.values.any((s) => s == _UploadStatus.uploading);

  // ── UI helpers ──────────────────────────────────────────────────────────────

  void _snack(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: error ? Colors.red : null),
    );
  }

  String _formatSize(int bytes) {
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  String get _title => switch (_step) {
        _Step.type => 'Create account',
        _Step.details => 'Your details',
        _Step.documents => 'Upload documents',
        _Step.otp => _isVerified ? 'Uploading documents' : 'Verify mobile',
        _Step.submitted => 'Application submitted',
      };

  bool get _showBackButton =>
      _step != _Step.submitted && !(_step == _Step.otp && _isVerified);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_title),
        automaticallyImplyLeading: false,
        leading: _showBackButton
            ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: _onAppBarBack)
            : null,
      ),
      body: BackButtonListener(
        onBackButtonPressed: _handleBack,
        child: SafeArea(
          child: Column(
            children: [
              if (_step != _Step.submitted) _stepIndicator(),
              Expanded(child: _buildStep()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStep() => switch (_step) {
        _Step.type => _typeStep(),
        _Step.details => _detailsStep(),
        _Step.documents => _documentsStep(),
        _Step.otp => _isVerified ? _uploadStep() : _otpStep(),
        _Step.submitted => _submittedStep(),
      };

  Widget _stepIndicator() {
    final steps = _visibleSteps;
    final current = steps.indexOf(_step);
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 4),
      child: Row(
        children: [
          for (var i = 0; i < steps.length; i++) ...[
            if (i > 0)
              Expanded(
                child: Container(
                  height: 2,
                  margin: const EdgeInsets.only(bottom: 18),
                  color: i <= current ? AppTheme.brandGreen : Colors.grey.shade300,
                ),
              ),
            _stepDot(i + 1, _stepLabels[steps[i]] ?? '',
                done: i < current, active: i == current),
          ],
        ],
      ),
    );
  }

  Widget _stepDot(int number, String label, {required bool done, required bool active}) {
    final highlighted = done || active;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 26,
          height: 26,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: highlighted ? AppTheme.brandGreen : Colors.white,
            border: Border.all(
              color: highlighted ? AppTheme.brandGreen : Colors.grey.shade400,
            ),
          ),
          child: Center(
            child: done
                ? const Icon(Icons.check, size: 15, color: Colors.white)
                : Text('$number',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: active ? Colors.white : Colors.grey.shade600,
                    )),
          ),
        ),
        const SizedBox(height: 4),
        Text(label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: active ? FontWeight.w700 : FontWeight.w500,
              color: highlighted ? AppTheme.brandGreen : Colors.grey.shade600,
            )),
      ],
    );
  }

  Widget _errorBanner() {
    final error = _error;
    if (error == null) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFDECEC),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFF5C2C2)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, color: AppTheme.errorRed, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(error,
                style: const TextStyle(color: AppTheme.errorRed, fontSize: 13.5)),
          ),
        ],
      ),
    );
  }

  Widget _primaryButton(String label, VoidCallback? onPressed, {bool loading = false}) =>
      ElevatedButton(
        onPressed: loading ? null : onPressed,
        child: loading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
            : Text(label),
      );

  Widget _sectionTitle(String text) => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 12),
        child: Text(text,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
      );

  // ── Step 1 UI ───────────────────────────────────────────────────────────────

  Widget _typeStep() {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Text('How will you use Dawabag?',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text('Pricing and verification depend on your account type.',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 14)),
        const SizedBox(height: 20),
        for (final option in _customerTypes) ...[
          _typeCard(option),
          const SizedBox(height: 12),
        ],
        const SizedBox(height: 12),
        _primaryButton(
          'Continue',
          _customerType == null ? null : () => _goTo(_Step.details),
        ),
        const SizedBox(height: 16),
        Center(
          child: GestureDetector(
            onTap: () => context.go('/auth/login'),
            child: RichText(
              text: TextSpan(
                style: TextStyle(color: Colors.grey.shade600, fontSize: 14),
                children: const [
                  TextSpan(text: 'Already have an account? '),
                  TextSpan(
                      text: 'Sign in',
                      style: TextStyle(
                          color: AppTheme.brandGreen, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _typeCard(_CustomerTypeOption option) {
    final selected = _customerType == option.value;
    return Material(
      color: selected ? AppTheme.brandGreen50 : Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => _selectType(option.value),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? AppTheme.brandGreen : Colors.grey.shade300,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: selected ? AppTheme.brandGreen : AppTheme.brandGreen50,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(option.icon,
                    color: selected ? Colors.white : AppTheme.brandGreen, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(option.label,
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text(option.description,
                        style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: option.value == 'customer'
                            ? AppTheme.brandGreen100
                            : AppTheme.amberBadge,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(option.kycNote,
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: option.value == 'customer'
                                ? AppTheme.brandGreen700
                                : AppTheme.amberText,
                          )),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                selected ? Icons.radio_button_checked : Icons.radio_button_off,
                color: selected ? AppTheme.brandGreen : Colors.grey.shade400,
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Step 2 UI ───────────────────────────────────────────────────────────────

  Widget _detailsStep() {
    final option = _customerTypes.firstWhere(
      (o) => o.value == _customerType,
      orElse: () => _customerTypes.first,
    );
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(option.label,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),

            if (_isB2B) ...[
              _sectionTitle('Business details'),
              _field(_businessCtrl, _isRetailer ? 'Pharmacy / hospital name' : 'Firm name',
                  validator: (v) => (v == null || v.trim().length < 2)
                      ? 'Business name is required'
                      : null),
              const SizedBox(height: 14),
              _dlTypeField(_isRetailer ? _retailerDlTypes : _wholesalerDlTypes),
              const SizedBox(height: 14),
              _field(_dlNumberCtrl, 'Drug licence number',
                  caps: true,
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? 'Drug licence number is required'
                      : null),
              const SizedBox(height: 14),
              _gstinField(isRequired: _isWholesaler),
              const SizedBox(height: 14),
              _panField(),
              if (_isRetailer && _gstinCtrl.text.trim().isEmpty) ...[
                const SizedBox(height: 8),
                _gstDeclarationField('I confirm this business is not registered under GST.'),
              ],
              const SizedBox(height: 20),
            ],

            if (_isDoctor) ...[
              _sectionTitle('Registration details'),
              _field(_nmcRegCtrl, 'NMC / State Medical Council reg. number',
                  caps: true,
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? 'Registration number is required'
                      : null),
              const SizedBox(height: 14),
              _field(_nmcCouncilCtrl, 'Medical council',
                  hint: 'e.g. Maharashtra Medical Council',
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? 'Medical council is required'
                      : null),
              const SizedBox(height: 14),
              _specialityField(),
              const SizedBox(height: 14),
              _panField(),
              const SizedBox(height: 8),
              _gstDeclarationField('I confirm I am not registered under GST.'),
              const SizedBox(height: 20),
            ],

            _sectionTitle(_isCustomer ? 'Your details' : 'Contact & login'),
            _field(
              _nameCtrl,
              _isDoctor
                  ? 'Full name (as registered, incl. "Dr.")'
                  : _isB2B
                      ? 'Contact person name'
                      : 'Full name',
              hint: _isDoctor ? 'Dr. Asha Patil' : 'Rajesh Shah',
              words: true,
              validator: (v) {
                final t = v?.trim() ?? '';
                if (t.length < 2) return 'Name is too short';
                if (t.length > 255) return 'Name is too long';
                return null;
              },
            ),
            const SizedBox(height: 14),
            _field(
              _mobileCtrl,
              'Mobile number',
              hint: '9876543210',
              prefix: '+91  ',
              keyboard: TextInputType.phone,
              maxLength: 10,
              formatters: [FilteringTextInputFormatter.digitsOnly],
              validator: (v) {
                if (v == null || v.isEmpty) return 'Mobile number required';
                if (!_mobileRe.hasMatch(v.trim())) return 'Enter valid 10-digit number';
                return null;
              },
            ),
            const SizedBox(height: 14),
            _field(
              _emailCtrl,
              _isB2B ? 'Email (invoices are sent here)' : 'Email (optional)',
              hint: 'name@example.com',
              keyboard: TextInputType.emailAddress,
              validator: (v) {
                final t = v?.trim() ?? '';
                if (t.isEmpty) return _isB2B ? 'Email is required' : null;
                if (!_emailRe.hasMatch(t)) return 'Enter a valid email';
                return null;
              },
            ),
            const SizedBox(height: 14),
            _field(
              _pincodeCtrl,
              _isCustomer ? 'Pincode (optional)' : 'Pincode',
              hint: '411001',
              keyboard: TextInputType.number,
              maxLength: 6,
              formatters: [FilteringTextInputFormatter.digitsOnly],
              validator: (v) {
                final t = v?.trim() ?? '';
                if (t.isEmpty) return _isCustomer ? null : 'Pincode is required';
                if (!_pincodeRe.hasMatch(t)) return 'Enter a valid 6-digit pincode';
                return null;
              },
            ),
            const SizedBox(height: 14),
            _passwordField(),
            const SizedBox(height: 14),
            _field(_confirmCtrl, 'Confirm password',
                obscure: !_showPassword,
                validator: (v) =>
                    v != _passwordCtrl.text ? 'Passwords do not match' : null),
            const SizedBox(height: 14),
            _field(_referralCtrl, 'Referral code (optional)', hint: 'e.g. RAJA20', caps: true),
            const SizedBox(height: 24),

            _errorBanner(),
            _primaryButton(
              _isCustomer ? 'Create account' : 'Continue',
              _onDetailsContinue,
              loading: _isSubmitting,
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(
    TextEditingController ctrl,
    String label, {
    String? hint,
    String? prefix,
    TextInputType? keyboard,
    bool obscure = false,
    bool caps = false,
    bool words = false,
    int? maxLength,
    List<TextInputFormatter>? formatters,
    String? Function(String?)? validator,
    ValueChanged<String>? onChanged,
  }) =>
      TextFormField(
        controller: ctrl,
        keyboardType: keyboard,
        obscureText: obscure,
        maxLength: maxLength,
        textCapitalization: caps
            ? TextCapitalization.characters
            : words
                ? TextCapitalization.words
                : TextCapitalization.none,
        inputFormatters: formatters,
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          prefixText: prefix,
          counterText: maxLength != null ? '' : null,
        ),
        validator: validator,
        onChanged: onChanged,
      );

  Widget _passwordField() => TextFormField(
        controller: _passwordCtrl,
        obscureText: !_showPassword,
        decoration: InputDecoration(
          labelText: 'Password',
          helperText: 'Minimum 8 characters',
          suffixIcon: IconButton(
            icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility, size: 20),
            onPressed: () => setState(() => _showPassword = !_showPassword),
          ),
        ),
        validator: (v) => (v == null || v.length < 8) ? 'Minimum 8 characters' : null,
      );

  Widget _panField() => _field(
        _panCtrl,
        'PAN',
        hint: 'ABCDE1234F',
        caps: true,
        maxLength: 10,
        formatters: [
          FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]')),
          _UpperCaseFormatter(),
        ],
        validator: (v) {
          final t = (v ?? '').trim().toUpperCase();
          if (t.isEmpty) return 'PAN is required';
          if (!_panRe.hasMatch(t)) return 'Enter a valid PAN (e.g. ABCDE1234F)';
          return null;
        },
      );

  Widget _gstinField({required bool isRequired}) => _field(
        _gstinCtrl,
        isRequired ? 'GSTIN' : 'GSTIN (optional)',
        hint: '27ABCDE1234F1Z5',
        caps: true,
        maxLength: 15,
        formatters: [
          FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]')),
          _UpperCaseFormatter(),
        ],
        // Rebuild so the GST declaration checkbox shows/hides for retailers.
        onChanged: (_) => setState(() {}),
        validator: (v) {
          final t = (v ?? '').trim().toUpperCase();
          if (t.isEmpty) return isRequired ? 'GSTIN is required' : null;
          if (!_gstinRe.hasMatch(t)) return 'Enter a valid 15-character GSTIN';
          return null;
        },
      );

  Widget _dlTypeField(Map<String, String> options) => DropdownButtonFormField<String>(
        key: ValueKey('dl_type_$_customerType'),
        value: options.containsKey(_dlType) ? _dlType : null,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Drug licence type'),
        items: options.entries
            .map((e) => DropdownMenuItem<String>(value: e.key, child: Text(e.value)))
            .toList(),
        onChanged: (v) => setState(() => _dlType = v),
        validator: (v) => v == null ? 'Select the drug licence type' : null,
      );

  Widget _specialityField() => DropdownButtonFormField<String>(
        value: _speciality,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Speciality'),
        items: _specialities
            .map((s) => DropdownMenuItem<String>(value: s, child: Text(s)))
            .toList(),
        onChanged: (v) => setState(() => _speciality = v),
        validator: (v) => v == null ? 'Select your speciality' : null,
      );

  Widget _gstDeclarationField(String text) => FormField<bool>(
        initialValue: _gstDeclared,
        validator: (_) => _gstDeclared ? null : 'Please confirm to continue',
        builder: (field) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CheckboxListTile(
              value: _gstDeclared,
              onChanged: (v) {
                setState(() => _gstDeclared = v ?? false);
                field.didChange(v ?? false);
              },
              title: Text(text, style: const TextStyle(fontSize: 14)),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
              dense: true,
              activeColor: AppTheme.brandGreen,
            ),
            if (field.hasError)
              Padding(
                padding: const EdgeInsets.only(left: 12),
                child: Text(field.errorText ?? '',
                    style: TextStyle(
                        color: Theme.of(context).colorScheme.error, fontSize: 12)),
              ),
          ],
        ),
      );

  // ── Step 3 UI ───────────────────────────────────────────────────────────────

  Widget _documentsStep() {
    final requiredDocs = _requiredDocs;
    final optionalDocs = _optionalDocs;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Text('Upload your documents',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text(
          'PDF, JPG or PNG, max 5 MB each. Files are uploaded after you verify your mobile number.',
          style: TextStyle(color: Colors.grey.shade600, fontSize: 13.5),
        ),
        const SizedBox(height: 20),
        for (final type in requiredDocs) ...[
          _documentPickTile(type, isRequired: true),
          const SizedBox(height: 10),
        ],
        for (final type in optionalDocs) ...[
          _documentPickTile(type, isRequired: false),
          const SizedBox(height: 10),
        ],
        const SizedBox(height: 14),
        _errorBanner(),
        _primaryButton(
          _isRegistered ? 'Continue' : 'Create account & send OTP',
          _onDocumentsContinue,
          loading: _isSubmitting,
        ),
      ],
    );
  }

  Widget _documentPickTile(String type, {required bool isRequired}) {
    final file = _files[type];
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
        child: Row(
          children: [
            Icon(
              file != null ? Icons.check_circle : Icons.description_outlined,
              color: file != null ? AppTheme.brandGreen : Colors.grey.shade500,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    isRequired ? _docLabel(type) : '${_docLabel(type)} (optional)',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    file != null
                        ? '${file.name} · ${_formatSize(file.size)}'
                        : 'No file selected',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600),
                  ),
                ],
              ),
            ),
            if (file != null)
              IconButton(
                tooltip: 'Remove',
                icon: const Icon(Icons.close, size: 20),
                onPressed: () => setState(() => _files.remove(type)),
              ),
            TextButton(
              onPressed: _isSubmitting ? null : () => _pickFile(type),
              child: Text(file != null ? 'Change' : 'Choose'),
            ),
          ],
        ),
      ),
    );
  }

  // ── Step 4 UI: OTP ──────────────────────────────────────────────────────────

  Widget _otpStep() {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 8),
        Text('Enter the 6-digit OTP sent to',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 15)),
        const SizedBox(height: 4),
        Text('+91 ${_registeredMobile ?? ''}',
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
        const SizedBox(height: 28),
        OtpInput(
          key: _otpKey,
          enabled: !_isVerifying,
          onChanged: (v) => setState(() => _otp = v),
          onCompleted: (_) => _verifyOtp(),
        ),
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: (_resendIn > 0 || _isResending || _isVerifying) ? null : _resendOtp,
            child: Text(_resendIn > 0 ? 'Resend OTP in ${_resendIn}s' : 'Resend OTP'),
          ),
        ),
        if (!_isCustomer) ...[
          const SizedBox(height: 4),
          Text(
            'After verification your ${_files.length} document(s) will be uploaded.',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
          ),
        ],
        const SizedBox(height: 20),
        _errorBanner(),
        _primaryButton(
          'Verify',
          _otp.length == 6 ? _verifyOtp : null,
          loading: _isVerifying,
        ),
      ],
    );
  }

  // ── Step 4 UI: uploads ──────────────────────────────────────────────────────

  Widget _uploadStep() {
    final rows = _uploadRows;
    final hasFailed = _uploadStatus.values.any((s) => s == _UploadStatus.failed);
    final missing = (_missingDocs ?? const <String>[])
        .where((d) => !_files.containsKey(d))
        .toList();
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Row(
          children: const [
            Icon(Icons.verified, color: AppTheme.brandGreen),
            SizedBox(width: 8),
            Expanded(
              child: Text('Mobile verified',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
          ],
        ),
        const SizedBox(height: 6),
        Text('Uploading your documents for KYC review.',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 14)),
        const SizedBox(height: 20),
        for (final type in rows) ...[
          _uploadTile(type),
          const SizedBox(height: 10),
        ],
        if (missing.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            'Still required: ${missing.map(_docLabel).join(', ')}',
            style: const TextStyle(color: AppTheme.amberText, fontSize: 13.5),
          ),
        ],
        const SizedBox(height: 20),
        if (hasFailed && !_anyUploading) ...[
          OutlinedButton(
            onPressed: _uploadAll,
            child: const Text('Retry failed uploads'),
          ),
          const SizedBox(height: 12),
        ],
        _primaryButton(
          'Submit application',
          (_allUploadsDone && !_anyUploading) ? () => _goTo(_Step.submitted) : null,
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: _anyUploading
              ? null
              : () => _finish(
                    message: 'KYC review starts once all required documents are uploaded.',
                  ),
          child: const Text('Skip for now'),
        ),
      ],
    );
  }

  Widget _uploadTile(String type) {
    final file = _files[type];
    final status = file == null ? null : (_uploadStatus[type] ?? _UploadStatus.pending);

    Widget leading = Icon(Icons.description_outlined, color: Colors.grey.shade500);
    String subtitle = 'No file selected';
    Color subtitleColor = Colors.grey.shade600;
    if (status == _UploadStatus.uploading) {
      leading = const SizedBox(
        width: 22,
        height: 22,
        child: CircularProgressIndicator(strokeWidth: 2),
      );
      subtitle = 'Uploading…';
    } else if (status == _UploadStatus.done) {
      leading = const Icon(Icons.check_circle, color: AppTheme.brandGreen);
      subtitle = 'Uploaded';
    } else if (status == _UploadStatus.failed) {
      leading = const Icon(Icons.error, color: AppTheme.errorRed);
      subtitle = _uploadError[type] ?? 'Upload failed';
      subtitleColor = AppTheme.errorRed;
    } else if (status == _UploadStatus.pending) {
      leading = Icon(Icons.schedule, color: Colors.grey.shade500);
      subtitle = 'Waiting…';
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
        child: Row(
          children: [
            leading,
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_docLabel(type),
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  if (file != null) ...[
                    const SizedBox(height: 2),
                    Text(file.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12.5, color: Colors.grey.shade600)),
                  ],
                  const SizedBox(height: 2),
                  Text(subtitle, style: TextStyle(fontSize: 12.5, color: subtitleColor)),
                ],
              ),
            ),
            if (status == _UploadStatus.failed) ...[
              TextButton(
                onPressed: () => _uploadOne(type),
                child: const Text('Retry'),
              ),
              IconButton(
                tooltip: 'Choose another file',
                icon: const Icon(Icons.swap_horiz, size: 20),
                onPressed: () => _pickFile(type, uploadNow: true),
              ),
            ],
            if (status == null)
              TextButton(
                onPressed: () => _pickFile(type, uploadNow: true),
                child: const Text('Choose'),
              ),
          ],
        ),
      ),
    );
  }

  // ── Final screen ────────────────────────────────────────────────────────────

  Widget _submittedStep() {
    final days = _isWholesaler ? '2–3' : '1–2';
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 32),
        Center(
          child: Container(
            width: 72,
            height: 72,
            decoration: const BoxDecoration(
              color: AppTheme.brandGreen50,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.task_alt, color: AppTheme.brandGreen, size: 40),
          ),
        ),
        const SizedBox(height: 20),
        const Text('Application submitted',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        Text(
          'Our team will verify your documents within $days working days. '
          "You'll get an SMS and email once approved.",
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 14.5, color: Colors.grey.shade700, height: 1.4),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppTheme.amberBadge,
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Text(
            'Until then you can browse at retail prices but cannot place trade orders.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppTheme.amberText, fontSize: 13.5),
          ),
        ),
        const SizedBox(height: 28),
        _primaryButton('Start browsing', () => _finish()),
      ],
    );
  }
}
