import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../utils/formatters.dart';
import 'demo_checkout_data.dart';
import 'demo_qr.dart';

/// "Pay ₹X" on a method step: moves to the approve screen (no payment yet).
class DemoPayButton extends StatelessWidget {
  final int amountPaise;
  final VoidCallback? onPressed;
  const DemoPayButton({super.key, required this.amountPaise, this.onPressed});

  @override
  Widget build(BuildContext context) => ElevatedButton(onPressed: onPressed, child: Text('Pay ${formatPrice(amountPaise)}'));
}

/// UPI: pay to a UPI id (pre-filled demo@upi) or "scan" a demo QR picture.
class DemoUpiStep extends StatefulWidget {
  final int amountPaise;
  /// the UPI id, or null when the QR picture was used
  final ValueChanged<String?> onPay;
  const DemoUpiStep({super.key, required this.amountPaise, required this.onPay});

  @override
  State<DemoUpiStep> createState() => _DemoUpiStepState();
}

class _DemoUpiStepState extends State<DemoUpiStep> {
  final _vpa = TextEditingController(text: demoVpa);
  bool _qr = false;

  @override
  void dispose() {
    _vpa.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final valid = isValidVpa(_vpa.text);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SegmentedButton<bool>(
        segments: const [
          ButtonSegment(value: false, label: Text('Pay by UPI ID')),
          ButtonSegment(value: true, label: Text('Scan QR')),
        ],
        selected: {_qr},
        showSelectedIcon: false,
        onSelectionChanged: (s) => setState(() => _qr = s.first),
      ),
      const SizedBox(height: 12),
      if (_qr)
        const DemoQr()
      else
        TextField(
          controller: _vpa,
          autocorrect: false,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            labelText: 'Your UPI ID',
            helperText: 'Demo UPI ID filled in for you. Written as name@bank.',
            errorText: valid ? null : 'Write it as name@bank, for example demo@upi.',
          ),
        ),
      const SizedBox(height: 12),
      DemoPayButton(
        amountPaise: widget.amountPaise,
        onPressed: _qr ? () => widget.onPay(null) : (valid ? () => widget.onPay(_vpa.text.trim()) : null),
      ),
    ]);
  }
}

/// Card: a fixed test card, read-only — a real card can never be typed here.
class DemoCardStep extends StatelessWidget {
  final int amountPaise;
  final VoidCallback onPay;
  const DemoCardStep({super.key, required this.amountPaise, required this.onPay});

  Widget _field(String label, String value) => TextFormField(
        initialValue: value,
        readOnly: true,
        enableInteractiveSelection: false,
        canRequestFocus: false,
        style: TextStyle(color: Colors.grey.shade700),
        decoration: InputDecoration(labelText: label, filled: true, fillColor: Colors.grey.shade100),
      );

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: AppTheme.amberBadge, borderRadius: BorderRadius.circular(8)),
        child: const Text('Demo — do not enter a real card. A test card is filled in and cannot be changed.',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.amberText)),
      ),
      const SizedBox(height: 10),
      _field('Card number', demoCardNumber),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: _field('Expiry (MM/YY)', demoCardExpiry())),
        const SizedBox(width: 8),
        Expanded(child: _field('CVV', demoCardCvv)),
      ]),
      const SizedBox(height: 8),
      _field('Name on card', demoCardName),
      const SizedBox(height: 12),
      DemoPayButton(amountPaise: amountPaise, onPressed: onPay),
    ]);
  }
}

/// Netbanking or wallet: choose a bank / wallet from the server's list, then Pay.
class DemoProviderStep extends StatefulWidget {
  final List<String> providers;
  final int amountPaise;
  final ValueChanged<String> onPay;
  const DemoProviderStep({super.key, required this.providers, required this.amountPaise, required this.onPay});

  @override
  State<DemoProviderStep> createState() => _DemoProviderStepState();
}

class _DemoProviderStepState extends State<DemoProviderStep> {
  String? _chosen;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final p in widget.providers)
          ChoiceChip(
            label: Text(p),
            selected: _chosen == p,
            selectedColor: AppTheme.brandTeal50,
            onSelected: (_) => setState(() => _chosen = p),
          ),
      ]),
      if (_chosen == null) ...[
        const SizedBox(height: 6),
        Text('Choose one to continue.', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
      ],
      const SizedBox(height: 12),
      DemoPayButton(amountPaise: widget.amountPaise, onPressed: _chosen == null ? null : () => widget.onPay(_chosen!)),
    ]);
  }
}
