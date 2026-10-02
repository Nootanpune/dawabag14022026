import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/theme.dart';
import '../../providers/prescription_provider.dart';
import '../../services/api_service.dart';
import '../../services/prescription_api.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/error_retry_view.dart';
import '../checkout/widgets/prescription_step.dart' show pickPrescriptionImage;
import 'widgets/after_upload_card.dart';
import 'widgets/prescription_tile.dart';
import 'widgets/prescription_upload_card.dart';

/// Upload a prescription any time and see the ones in the account (Sprint 25).
/// The file goes straight to the server; the app keeps no copy (C-41). The
/// buyer chooses it at checkout and a pharmacist checks it with the order
/// before anything is dispensed (C-08). Signed-in only (router: /account/…).
class PrescriptionsScreen extends ConsumerStatefulWidget {
  const PrescriptionsScreen({super.key});

  @override
  ConsumerState<PrescriptionsScreen> createState() => _PrescriptionsScreenState();
}

class _PrescriptionsScreenState extends ConsumerState<PrescriptionsScreen> {
  static const _maxBytes = 10 * 1024 * 1024;
  bool _busy = false;
  bool _uploaded = false;

  void _say(String text, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(text), backgroundColor: error ? Colors.red : null));
  }

  Future<void> _upload(String path, String name) async {
    setState(() => _busy = true);
    try {
      await apiService.uploadPrescription(filePath: path, filename: name);
      if (!mounted) return;
      setState(() => _uploaded = true);
      ref.invalidate(myPrescriptionsProvider);
      _say('Prescription uploaded');
    } catch (e) {
      _say(ApiService.errorMessage(e, fallback: 'Upload failed. Please try again.'), error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _photo() async {
    final file = await pickPrescriptionImage(context);
    if (file == null) return;
    if (await file.length() > _maxBytes) return _say('This photo is larger than 10 MB.', error: true);
    await _upload(file.path, file.name);
  }

  Future<void> _pdf() async {
    FilePickerResult? result;
    try {
      result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['pdf']);
    } catch (_) {
      return _say('Could not open the file picker', error: true);
    }
    final file = result?.files.firstOrNull;
    if (file == null || file.path == null) return;
    if (file.size > _maxBytes) return _say('${file.name} is larger than 10 MB.', error: true);
    await _upload(file.path!, file.name);
  }

  Future<void> _view(Map<String, dynamic> rx) async {
    try {
      final url = await apiService.prescriptionLink(rx['id'].toString());
      if (url != null) await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    } catch (e) {
      _say(ApiService.errorMessage(e, fallback: 'Could not open the prescription'), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final list = ref.watch(myPrescriptionsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Prescriptions')),
      body: RefreshIndicator(
        color: AppTheme.brandGreen,
        onRefresh: () => ref.refresh(myPrescriptionsProvider.future),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text('Upload your doctor\'s prescription, add the medicines to your cart, and choose the prescription at checkout.',
                style: TextStyle(fontSize: 13, height: 1.35)),
            const SizedBox(height: 12),
            PrescriptionUploadCard(busy: _busy, onPhoto: _photo, onPdf: _pdf),
            if (_uploaded) ...[
              const SizedBox(height: 12),
              AfterUploadCard(onFindMedicines: () => context.go('/search')),
            ],
            const SizedBox(height: 20),
            const Text('Your prescriptions', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            list.when(
              loading: () => const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
              error: (e, _) => ErrorRetryView(
                message: ApiService.errorMessage(e, fallback: 'Could not load your prescriptions'),
                onRetry: () => ref.invalidate(myPrescriptionsProvider),
              ),
              data: (items) => items.isEmpty
                  ? const EmptyState(
                      icon: Icons.description_outlined,
                      title: 'No prescriptions yet',
                      hint: 'Upload one above. It stays in your account for your next orders.',
                    )
                  : Column(children: [for (final rx in items) PrescriptionTile(rx: rx, onView: () => _view(rx))]),
            ),
          ],
        ),
      ),
    );
  }
}
