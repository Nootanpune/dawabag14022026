import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/privacy.dart';
import '../../../utils/formatters.dart';

/// Marketing switch + the current consent record per purpose, with the
/// append-only history behind an expander (C-40 / C-42). Values are the
/// server's; the switch sends a request and shows the server's answer.
class ConsentSection extends StatelessWidget {
  final PrivacyConsents consents;
  final bool busy;
  final ValueChanged<bool> onMarketingChanged;

  const ConsentSection({
    super.key,
    required this.consents,
    required this.busy,
    required this.onMarketingChanged,
  });

  @override
  Widget build(BuildContext context) {
    final marketing = consents.currentFor('marketing');
    final others = consents.current.where((c) => c.purpose != 'marketing').toList();
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SwitchListTile(
              value: consents.marketingGranted,
              onChanged: busy ? null : onMarketingChanged,
              activeColor: AppTheme.brandGreen,
              title: const Text('Offers and marketing messages', style: TextStyle(fontSize: 14)),
              subtitle: Text(
                marketing?.recordedAt != null
                    ? 'Last changed ${formatDateTime(marketing!.recordedAt!)}. You can change this at any time.'
                    : 'Off unless you turn it on. Order and health updates are sent regardless.',
                style: const TextStyle(fontSize: 12),
              ),
            ),
            ...others.map((c) => ListTile(
                  dense: true,
                  leading: Icon(c.granted ? Icons.check_circle : Icons.cancel,
                      size: 20, color: c.granted ? AppTheme.brandGreen : Colors.grey),
                  title: Text(consentPurposeLabel(c.purpose), style: const TextStyle(fontSize: 13)),
                  subtitle: Text(_recordLine(c), style: const TextStyle(fontSize: 11)),
                )),
            if (consents.history.isNotEmpty)
              ExpansionTile(
                title: const Text('Consent history', style: TextStyle(fontSize: 13)),
                children: consents.history
                    .map((c) => ListTile(
                          dense: true,
                          title: Text(
                            '${consentPurposeLabel(c.purpose)}: ${c.granted ? 'given' : 'withdrawn'}',
                            style: const TextStyle(fontSize: 12),
                          ),
                          subtitle: Text(_recordLine(c), style: const TextStyle(fontSize: 11)),
                        ))
                    .toList(),
              ),
            if (consents.policyVersion != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                child: Text('Current privacy notice version: ${consents.policyVersion}',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
              ),
          ],
        ),
      ),
    );
  }

  static String _recordLine(ConsentRecord c) => [
        if (c.recordedAt != null) formatDateTime(c.recordedAt!),
        if (c.policyVersion != null) 'notice ${c.policyVersion}',
      ].join(' · ');
}
