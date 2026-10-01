import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/theme.dart';
import '../../models/eprescription.dart';
import '../../providers/consultation_provider.dart';
import '../../services/consultation_api.dart';
import '../../services/api_service.dart';
import '../../utils/consult_format.dart';
import '../../widgets/error_retry_view.dart';
import 'widgets/eprescription_sections.dart';

/// /consultations/prescriptions/:id[?orderId=] — the e-prescription from a
/// teleconsultation, in the Telemedicine Practice Guidelines 2020 format
/// (C-23, C-24). The patient may buy the medicines from any pharmacy;
/// "Order at Dawabag" is optional (POST /consultations/prescriptions/:id/use)
/// and is never a condition of the consultation (C-20). The PDF copy is
/// offered on the website only, because the app writes no files.
class EPrescriptionScreen extends ConsumerStatefulWidget {
  final String prescriptionId;
  final String? orderId;
  const EPrescriptionScreen({super.key, required this.prescriptionId, this.orderId});

  @override
  ConsumerState<EPrescriptionScreen> createState() => _EPrescriptionScreenState();
}

class _EPrescriptionScreenState extends ConsumerState<EPrescriptionScreen> {
  bool _sending = false;

  void _reload() => ref.invalidate(ePrescriptionProvider(widget.prescriptionId));

  Future<void> _orderAtDawabag() async {
    setState(() => _sending = true);
    try {
      await apiService.useEPrescriptionAtDawabag(widget.prescriptionId, orderId: widget.orderId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Sent to Dawabag. Our pharmacist will check it before any medicine is dispensed.'),
      ));
      _reload();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(consultErrorMessage(e, fallback: 'Could not send this prescription to Dawabag')),
        backgroundColor: Colors.red,
      ));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(ePrescriptionProvider(widget.prescriptionId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('E-prescription'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _reload)],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load this prescription'),
          onRetry: _reload,
        ),
        data: (rx) => RefreshIndicator(
          color: AppTheme.brandGreen,
          onRefresh: () => ref.refresh(ePrescriptionProvider(widget.prescriptionId).future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              RxDoctorSection(rx: rx),
              RxPatientSection(rx: rx),
              if (rx.diagnosis != null && rx.diagnosis!.trim().isNotEmpty)
                RxDiagnosisSection(diagnosis: rx.diagnosis!.trim()),
              RxMedicinesSection(items: rx.items),
              if (rx.advice != null && rx.advice!.trim().isNotEmpty)
                RxAdviceSection(advice: rx.advice!.trim()),
              RxValiditySection(rx: rx),
              const SizedBox(height: 12),
              const _AnyPharmacyNote(),
              const SizedBox(height: 12),
              _OrderAtDawabag(rx: rx, sending: _sending, onOrder: _orderAtDawabag),
              const SizedBox(height: 8),
              // The app writes no files (server is the single source of truth);
              // the PDF copy is offered on the website instead.
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.picture_as_pdf_outlined),
                title: const Text('Download as PDF', style: TextStyle(fontSize: 14)),
                subtitle: const Text(
                  'Available when you sign in on the Dawabag website (dawabag.in).',
                  style: TextStyle(fontSize: 12),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}

class _AnyPharmacyNote extends StatelessWidget {
  const _AnyPharmacyNote();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppTheme.brandGreen50,
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.storefront_outlined, size: 20, color: AppTheme.brandGreen700),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'You may buy these medicines from any pharmacy.',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.brandGreen700),
              ),
            ),
          ],
        ),
      );
}

/// Optional: send the e-prescription to Dawabag so it can be used for an
/// order. Once sent, it shows as sent (the server keeps one copy).
class _OrderAtDawabag extends StatelessWidget {
  final EPrescription rx;
  final bool sending;
  final VoidCallback onOrder;
  const _OrderAtDawabag({required this.rx, required this.sending, required this.onOrder});

  @override
  Widget build(BuildContext context) {
    if (rx.sentToDawabag) {
      return Row(
        children: [
          const Icon(Icons.check_circle, color: AppTheme.brandGreen, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Sent to Dawabag. It is in your prescriptions for our pharmacist to check.',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
            ),
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OutlinedButton.icon(
          onPressed: sending ? null : onOrder,
          icon: sending
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.local_pharmacy_outlined),
          label: const Text('Order at Dawabag'),
        ),
        const SizedBox(height: 4),
        Text(
          'Optional. Our pharmacist checks the prescription before any medicine is dispensed.',
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
        ),
      ],
    );
  }
}
