import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/consultation.dart';

/// Video / audio / chat choice for POST /consultations/book.
class ConsultModeChips extends StatelessWidget {
  final String value;
  final bool enabled;
  final ValueChanged<String> onChanged;
  const ConsultModeChips({
    super.key,
    required this.value,
    required this.onChanged,
    this.enabled = true,
  });

  static const Map<String, IconData> _icons = {
    'video': Icons.videocam_outlined,
    'audio': Icons.call_outlined,
    'text': Icons.chat_bubble_outline,
  };

  @override
  Widget build(BuildContext context) => Wrap(
        spacing: 8,
        children: kConsultModes.entries
            .map((e) => ChoiceChip(
                  avatar: Icon(_icons[e.key], size: 18),
                  label: Text(e.value),
                  selected: value == e.key,
                  selectedColor: AppTheme.brandGreen100,
                  onSelected: enabled ? (_) => onChanged(e.key) : null,
                ))
            .toList(),
      );
}

/// Same wording as the website's booking form.
const String kTeleconsultConsentText =
    'I consent to a teleconsultation with this doctor under the Telemedicine Practice Guidelines, '
    '2020. I understand the doctor cannot examine me physically, may ask me to visit in person, and '
    'may prescribe only medicines the guidelines allow for this kind of consultation. Schedule X and '
    'narcotic medicines are never prescribed online.';

/// Teleconsultation consent (Telemedicine Practice Guidelines 2020: the
/// patient starting a teleconsultation is recorded as implied consent; the
/// app asks for it explicitly and the server stores it with the booking).
class TeleconsultConsent extends StatelessWidget {
  final bool value;
  final bool enabled;
  final ValueChanged<bool> onChanged;
  const TeleconsultConsent({
    super.key,
    required this.value,
    required this.onChanged,
    this.enabled = true,
  });

  @override
  Widget build(BuildContext context) => CheckboxListTile(
        value: value,
        onChanged: enabled ? (v) => onChanged(v ?? false) : null,
        controlAffinity: ListTileControlAffinity.leading,
        contentPadding: EdgeInsets.zero,
        activeColor: AppTheme.brandGreen,
        title: const Text(
          kTeleconsultConsentText,
          style: TextStyle(fontSize: 13),
        ),
      );
}
