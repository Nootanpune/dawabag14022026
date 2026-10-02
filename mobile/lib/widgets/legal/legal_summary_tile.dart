import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../models/legal_info.dart';
import '../../providers/legal_provider.dart';
import '../../utils/ist.dart';

/// Compact, expandable "Licences, pharmacist & grievance officer" footer.
/// Keeps the statutory disclosures one tap away on every visit (C-04: seller,
/// drug licences, pharmacist in charge; C-36: grievance officer) without a
/// large block. The details are fetched from GET /legal/info only when the
/// tile is opened; the full page is /legal.
class LegalSummaryTile extends StatelessWidget {
  const LegalSummaryTile({super.key});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: const ExpansionTile(
          leading: Icon(Icons.gavel_outlined, size: 20, color: AppTheme.brandTeal),
          title: Text('Licences, pharmacist & grievance officer',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          childrenPadding: EdgeInsets.fromLTRB(16, 0, 16, 8),
          expandedCrossAxisAlignment: CrossAxisAlignment.start,
          children: [_LegalSummaryBody()],
        ),
      ),
    );
  }
}

class _LegalSummaryBody extends ConsumerWidget {
  const _LegalSummaryBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(legalInfoProvider);
    return async.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(12),
        child: Center(child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.brandTeal)),
      ),
      error: (_, __) => const _FullDetailsLink(
        lead: Text('Could not load the details just now.', style: TextStyle(fontSize: 12)),
      ),
      data: (info) => _FullDetailsLink(lead: _Lines(info: info)),
    );
  }
}

class _Lines extends StatelessWidget {
  final LegalInfo info;
  const _Lines({required this.info});

  @override
  Widget build(BuildContext context) {
    final dl = info.drugLicences;
    final retail = [legalValue(dl, 'retail_20'), legalValue(dl, 'retail_21')].whereType<String>().join(', ');
    final validUpto = legalValue(dl, 'valid_upto');
    final pharmacist = [
      legalValue(info.pharmacist, 'name'),
      if (legalValue(info.pharmacist, 'registration_no') case final reg?) 'Reg. no. $reg',
    ].whereType<String>().join(' · ');
    final officer = info.grievanceOfficer;
    final officerLine = [
      legalValue(officer, 'name'),
      legalValue(officer, 'email'),
      legalValue(officer, 'phone'),
    ].whereType<String>().join(' · ');

    final rows = <(String, String)>[
      if (legalValue(info.entity, 'name') case final seller?) ('Seller', seller),
      if (retail.isNotEmpty)
        ('Drug licence', validUpto == null ? retail : '$retail (valid up to ${formatDateIst(validUpto)})'),
      if (pharmacist.isNotEmpty) ('Pharmacist', pharmacist),
      if (officerLine.isNotEmpty) ('Grievance officer', officerLine),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final (label, value) in rows)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text.rich(
              TextSpan(children: [
                TextSpan(text: '$label: ', style: TextStyle(color: Colors.grey.shade600)),
                TextSpan(text: value),
              ]),
              style: const TextStyle(fontSize: 12, height: 1.35),
            ),
          ),
      ],
    );
  }
}

class _FullDetailsLink extends StatelessWidget {
  final Widget lead;
  const _FullDetailsLink({required this.lead});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        lead,
        TextButton(
          style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 36)),
          onPressed: () => context.push('/legal'),
          child: const Text('Full details, complaints & policies'),
        ),
      ],
    );
  }
}
