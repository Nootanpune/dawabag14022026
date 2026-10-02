import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../models/drug_licence.dart';
import '../../../models/licence_draft.dart';
import '../../../services/api_service.dart';
import '../../../services/licence_api.dart';
import '../../checkout/widgets/prescription_step.dart' show showPrescriptionSourceSheet;
import 'licence_tile.dart';

/// "Your drug licences" for a retailer, wholesaler or doctor / hospital account
/// (Sprint 30, C-11, C-14): every licence with its valid-till date; expired
/// ones are flagged. Sprint 32: send a renewed or another licence, and add a
/// photo to one still waiting for the check — the same API as the web.
/// Loaded from the server each time; nothing is stored.
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

  Future<void> _send() async {
    final sent = await context.push<bool>('/account/licences/renew');
    if (sent == true && mounted) _reload();
  }

  /// A photo of a licence still waiting for the check goes straight to the server.
  Future<void> _uploadCopy(DrugLicence licence) async {
    final id = licence.id;
    if (id == null) return;
    final messenger = ScaffoldMessenger.of(context);
    final source = await showPrescriptionSourceSheet(context);
    if (source == null) return;
    final photo = await ImagePicker().pickImage(source: source, imageQuality: 85);
    if (photo == null) return;
    if (await photo.length() > kLicenceFileMaxBytes) {
      messenger.showSnackBar(const SnackBar(content: Text('This photo is larger than 5 MB.'), backgroundColor: Colors.red));
      return;
    }
    try {
      await apiService.uploadLicenceCopy(id, filePath: photo.path, filename: photo.name);
      messenger.showSnackBar(const SnackBar(content: Text('Licence copy uploaded')));
      if (mounted) _reload();
    } catch (e) {
      messenger.showSnackBar(SnackBar(
          content: Text(ApiService.errorMessage(e, fallback: 'Could not upload')), backgroundColor: Colors.red));
    }
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
            return LicenceSummaryView(
              summary: snap.data ?? const DrugLicenceSummary(),
              onSend: _send,
              onUploadCopy: _uploadCopy,
            );
          },
        ),
      ),
    );
  }
}

/// The list itself (separate so it can be tested without the network).
class LicenceSummaryView extends StatelessWidget {
  final DrugLicenceSummary summary;
  /// "Send a renewed or another licence" (Sprint 32)
  final VoidCallback? onSend;
  /// Add a photo to a licence waiting for the check
  final ValueChanged<DrugLicence>? onUploadCopy;
  const LicenceSummaryView({super.key, required this.summary, this.onSend, this.onUploadCopy});

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
        ...summary.licences.map((l) => LicenceTile(
              licence: l,
              onUploadCopy: onUploadCopy == null || l.status != 'pending' ? null : () => onUploadCopy!(l),
            )),
        const SizedBox(height: 12),
        if (onSend != null)
          OutlinedButton.icon(
            onPressed: onSend,
            icon: const Icon(Icons.add, size: 20),
            label: const Text('Send a renewed or another licence'),
          ),
        const SizedBox(height: 8),
        Text(
          'If any licence passes its valid-till date, trade orders pause until the renewed licence is checked — '
          'send it before then.',
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
