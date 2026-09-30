import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/theme.dart';
import '../../../models/legal_info.dart';
import '../../../providers/auth_provider.dart';
import '../../../providers/legal_provider.dart';
import '../../../services/api_service.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/error_retry_view.dart';
import 'legal_section.dart';

/// /legal — "About & legal": seller entity, drug licences, pharmacist in
/// charge and grievance officer, as published by the server (C-04, C-36).
/// Public: shown to signed-out visitors too.
class LegalScreen extends ConsumerWidget {
  const LegalScreen({super.key});

  Future<void> _launch(BuildContext context, Uri uri) async {
    final ok = await launchUrl(uri);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Could not open this link')),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(legalInfoProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('About & legal')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load legal details'),
          onRetry: () => ref.invalidate(legalInfoProvider),
        ),
        data: (info) => RefreshIndicator(
          color: AppTheme.brandGreen,
          onRefresh: () => ref.refresh(legalInfoProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: _sections(context, ref, info),
          ),
        ),
      ),
    );
  }

  List<Widget> _sections(BuildContext context, WidgetRef ref, LegalInfo info) {
    final dl = info.drugLicences;
    final officer = info.grievanceOfficer;
    final email = legalValue(officer, 'email');
    final phone = legalValue(officer, 'phone');
    final validUpto = legalValue(dl, 'valid_upto');
    final signedIn = ref.watch(authProvider.select((s) => s.isAuthenticated));
    return [
      LegalSection(title: 'Seller', rows: [
        LegalRow('Legal name', legalValue(info.entity, 'name')),
        LegalRow('Registered address', legalValue(info.entity, 'address')),
        LegalRow('GSTIN', legalValue(info.entity, 'gstin')),
        LegalRow('CIN', legalValue(info.entity, 'cin')),
      ]),
      LegalSection(title: 'Drug licences', rows: [
        LegalRow('Retail — Form 20', legalValue(dl, 'retail_20')),
        LegalRow('Retail — Form 21', legalValue(dl, 'retail_21')),
        LegalRow('Wholesale — Form 20B', legalValue(dl, 'wholesale_20b')),
        LegalRow('Wholesale — Form 21B', legalValue(dl, 'wholesale_21b')),
        LegalRow('Valid up to', validUpto == null ? null : formatDate(validUpto)),
      ]),
      LegalSection(title: 'Pharmacist in charge', rows: [
        LegalRow('Name', legalValue(info.pharmacist, 'name')),
        LegalRow('Registration no.', legalValue(info.pharmacist, 'registration_no')),
      ]),
      LegalSection(
        title: 'Grievance Officer',
        rows: [
          LegalRow('Name', legalValue(officer, 'name')),
          LegalRow('Email', email,
              onTap: email == null ? null : () => _launch(context, Uri(scheme: 'mailto', path: email))),
          LegalRow('Phone', phone,
              onTap: phone == null ? null : () => _launch(context, Uri(scheme: 'tel', path: phone))),
          LegalRow('Address', legalValue(officer, 'address')),
        ],
        footer: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (info.acknowledgeWithinHours != null || info.resolveWithinDays != null)
              Text(
                'We acknowledge complaints within ${info.acknowledgeWithinHours ?? 48} hours '
                'and resolve them within ${info.resolveWithinDays ?? 30} days.',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
              ),
            if (signedIn)
              TextButton.icon(
                onPressed: () => context.push('/account/complaints'),
                icon: const Icon(Icons.support_agent, size: 18),
                label: const Text('Raise or track a complaint'),
              ),
          ],
        ),
      ),
    ];
  }
}
