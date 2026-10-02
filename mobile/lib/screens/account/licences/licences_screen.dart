import 'package:flutter/material.dart';

import '../../../models/drug_licence.dart';
import '../../../services/api_service.dart';
import '../../../services/licence_api.dart';
import 'licence_tile.dart';

/// "Your drug licences" for a retailer, wholesaler or doctor / hospital account
/// (Sprint 30, C-11, C-14): every licence with its valid-till date; expired
/// ones are flagged. Loaded from the server each time; nothing is stored.
class LicencesScreen extends StatefulWidget {
  const LicencesScreen({super.key});

  @override
  State<LicencesScreen> createState() => _LicencesScreenState();
}

class _LicencesScreenState extends State<LicencesScreen> {
  late Future<DrugLicenceSummary> _future = apiService.getMyLicences();

  Future<void> _reload() async {
    setState(() => _future = apiService.getMyLicences());
    await _future;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Your drug licences')),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: FutureBuilder<DrugLicenceSummary>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snap.hasError) {
              return ListView(children: const [
                Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('Could not load your licences. Pull down to try again.'),
                ),
              ]);
            }
            return LicenceSummaryView(summary: snap.data ?? const DrugLicenceSummary());
          },
        ),
      ),
    );
  }
}

/// The list itself (separate so it can be tested without the network).
class LicenceSummaryView extends StatelessWidget {
  final DrugLicenceSummary summary;
  const LicenceSummaryView({super.key, required this.summary});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (!summary.canTrade && summary.problems.isNotEmpty)
          _Notice(
            color: Colors.red.shade50,
            border: Colors.red.shade200,
            title: 'Trade buying is paused',
            lines: summary.problems,
          ),
        if (summary.warnings.isNotEmpty)
          _Notice(
            color: Colors.amber.shade50,
            border: Colors.amber.shade200,
            title: 'Renew soon',
            lines: summary.warnings,
          ),
        if (summary.licences.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Text('No drug licence on file.'),
          ),
        ...summary.licences.map((l) => LicenceTile(licence: l)),
        const SizedBox(height: 12),
        Text(
          'To send a renewed or another licence, open Your drug licences in your account on the Dawabag website. '
          'If any licence passes its valid-till date, trade orders pause until the renewal is checked.',
          style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
        ),
      ],
    );
  }
}

class _Notice extends StatelessWidget {
  final Color color;
  final Color border;
  final String title;
  final List<String> lines;
  const _Notice({required this.color, required this.border, required this.title, required this.lines});

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: color, border: Border.all(color: border), borderRadius: BorderRadius.circular(8)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
            ...lines.map((l) => Padding(padding: const EdgeInsets.only(top: 4), child: Text('• $l'))),
          ],
        ),
      );
}
