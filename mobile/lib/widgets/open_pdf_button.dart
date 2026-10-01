import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../services/api_service.dart';

/// Asks the server for a signed, 5-minute PDF link and hands it to the
/// phone's browser / PDF viewer. The app itself downloads and saves nothing
/// (server is the single source of truth; C-13, C-33).
class OpenPdfButton extends StatefulWidget {
  final String label;
  final Future<Uri> Function() resolve;
  const OpenPdfButton({super.key, required this.label, required this.resolve});

  @override
  State<OpenPdfButton> createState() => _OpenPdfButtonState();
}

class _OpenPdfButtonState extends State<OpenPdfButton> {
  bool _busy = false;

  Future<void> _open() async {
    setState(() => _busy = true);
    String? error;
    try {
      final uri = await widget.resolve();
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!ok) error = 'Could not open the document';
    } catch (e) {
      error = ApiService.errorMessage(e, fallback: 'Could not open the document');
    }
    if (!mounted) return;
    setState(() => _busy = false);
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error), backgroundColor: Colors.red),
      );
    }
  }

  @override
  Widget build(BuildContext context) => TextButton.icon(
        onPressed: _busy ? null : _open,
        style: TextButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          visualDensity: VisualDensity.compact,
        ),
        icon: _busy
            ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.picture_as_pdf_outlined, size: 16),
        label: Text(widget.label, style: const TextStyle(fontSize: 12)),
      );
}
