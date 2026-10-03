import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/theme.dart';
import '../../models/practitioner.dart';
import '../../providers/practitioner_provider.dart';
import '../../services/api_service.dart';
import '../../services/registration_api.dart';
import '../uploads/pick_document.dart';

/// A doctor's / institution's medical council registration as Dawabag staff
/// verified it (Sprint 44; Drugs Rules 1945 r.65(9)(b)), from GET
/// /practitioner-sales/me: status, valid till and — when orders are paused —
/// the server's reason. Shown on the account and at checkout; nothing for other
/// buyers. With [allowRenewal] the doctor can send the renewed registration
/// certificate (POST /kyc/documents `nmc_certificate`, allowed while approved);
/// staff verify it again.
class RegistrationStatusCard extends ConsumerStatefulWidget {
  final bool compact;
  final bool allowRenewal;
  const RegistrationStatusCard({super.key, this.compact = false, this.allowRenewal = false});

  @override
  ConsumerState<RegistrationStatusCard> createState() => _RegistrationStatusCardState();
}

class _RegistrationStatusCardState extends ConsumerState<RegistrationStatusCard> {
  bool _uploading = false;
  String? _note;
  bool _noteIsError = false;

  Future<void> _renew(Future<PickedDocument?> Function() pick) async {
    setState(() => _note = null);
    PickedDocument? file;
    try {
      file = await pick();
    } on PickRefused catch (e) {
      setState(() {
        _note = e.message;
        _noteIsError = true;
      });
      return;
    }
    if (file == null || !mounted) return;
    setState(() => _uploading = true);
    try {
      await apiService.uploadKycDocument(documentType: 'nmc_certificate', filePath: file.path, filename: file.name);
      if (!mounted) return;
      ref.invalidate(practitionerRegistrationProvider);
      setState(() {
        _note = 'Certificate uploaded. Dawabag will verify it against the council register.';
        _noteIsError = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _note = ApiService.errorMessage(e, fallback: 'Upload failed. Please try again.');
          _noteIsError = true;
        });
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final reg = ref.watch(practitionerRegistrationProvider).valueOrNull;
    if (reg == null || !reg.applies) return const SizedBox.shrink();
    final ok = reg.canOrder;
    final fg = ok ? Colors.green.shade900 : Colors.red.shade900;
    return Container(
      key: const ValueKey('registration-status'),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ok ? Colors.green.shade50 : Colors.red.shade50,
        border: Border.all(color: ok ? Colors.green.shade200 : Colors.red.shade200),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(ok ? Icons.verified_outlined : Icons.gpp_maybe_outlined, size: 18, color: fg),
            const SizedBox(width: 8),
            Expanded(child: Text(reg.headline, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: fg))),
          ]),
          if (!widget.compact) ...[
            const SizedBox(height: 4),
            Text(reg.detail, style: TextStyle(fontSize: 12, color: Colors.grey.shade800)),
            if (reg.isInstitution && (reg.institutionName ?? '').isNotEmpty)
              Text('Institution: ${reg.institutionName}', style: TextStyle(fontSize: 12, color: Colors.grey.shade800)),
          ],
          if (!ok && (reg.message ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Semantics(
              liveRegion: true,
              child: Text(reg.message!,
                  key: const ValueKey('registration-message'), style: TextStyle(fontSize: 12, color: Colors.red.shade900)),
            ),
          ],
          if (widget.allowRenewal) ...[
            const SizedBox(height: 8),
            Text('Renewed your registration? Send the new certificate and we will verify it.',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
            const SizedBox(height: 6),
            Wrap(spacing: 8, runSpacing: 6, children: [
              OutlinedButton.icon(
                onPressed: _uploading ? null : () => _renew(() => pickPhotoDocument(context, maxBytes: kWrittenOrderMaxBytes)),
                icon: _uploading
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.camera_alt_outlined, size: 18),
                label: const Text('Certificate photo'),
              ),
              OutlinedButton.icon(
                onPressed: _uploading ? null : () => _renew(() => pickPdfDocument(maxBytes: kWrittenOrderMaxBytes)),
                icon: const Icon(Icons.picture_as_pdf_outlined, size: 18),
                label: const Text('Certificate PDF'),
              ),
            ]),
            if (_note != null) ...[
              const SizedBox(height: 6),
              Text(_note!,
                  style: TextStyle(fontSize: 12, color: _noteIsError ? Colors.red.shade900 : AppTheme.brandTeal700)),
            ],
          ],
        ],
      ),
    );
  }
}
