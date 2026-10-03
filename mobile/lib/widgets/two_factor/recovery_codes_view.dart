import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../config/theme.dart';

/// The ten one-time recovery codes, shown ONCE (Sprint 42; C-41, C-43). The
/// app never saves them — not in the keychain, not in a file, not in memory
/// after this view closes (owner rule: the server is the single source of
/// truth; the server keeps only their hashes). The person writes them down or
/// copies them (their own choice), ticks that they have kept them, then goes on.
class RecoveryCodesView extends StatefulWidget {
  final List<String> codes;
  final VoidCallback onDone;
  final String doneLabel;
  const RecoveryCodesView({super.key, required this.codes, required this.onDone, this.doneLabel = 'Continue'});

  @override
  State<RecoveryCodesView> createState() => _RecoveryCodesViewState();
}

class _RecoveryCodesViewState extends State<RecoveryCodesView> {
  bool _kept = false;

  Future<void> _copy() async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await Clipboard.setData(ClipboardData(text: widget.codes.join('\n')));
      messenger.showSnackBar(const SnackBar(content: Text('Codes copied. Paste them somewhere safe and private.')));
    } catch (_) {
      messenger.showSnackBar(const SnackBar(content: Text('Could not copy; write them down instead')));
    }
  }

  @override
  Widget build(BuildContext context) => Column(
        key: const Key('recovery-codes'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Write down your recovery codes',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(
            'If you lose your phone, each code signs you in once instead of the authenticator code. '
            'Write them down or keep them in a password manager. They are shown only now — '
            'Dawabag cannot show them again.',
            style: TextStyle(fontSize: 13.5, height: 1.35, color: AppTheme.muted(context)),
          ),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.brandTeal50,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppTheme.brandTeal100),
            ),
            child: Wrap(
              alignment: WrapAlignment.center,
              spacing: 16,
              runSpacing: 8,
              children: [
                for (final c in widget.codes)
                  SizedBox(
                    width: 120,
                    child: Text(c,
                        textAlign: TextAlign.center,
                        style: const TextStyle(fontFamily: 'monospace', fontSize: 15, letterSpacing: 1.2)),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _copy,
            icon: const Icon(Icons.copy, size: 18),
            label: const Text('Copy codes'),
          ),
          const SizedBox(height: 8),
          CheckboxListTile(
            value: _kept,
            onChanged: (v) => setState(() => _kept = v == true),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
            title: const Text('I have written these codes down or kept them somewhere safe',
                style: TextStyle(fontSize: 14)),
          ),
          const SizedBox(height: 8),
          ElevatedButton(onPressed: _kept ? widget.onDone : null, child: Text(widget.doneLabel)),
        ],
      );
}
