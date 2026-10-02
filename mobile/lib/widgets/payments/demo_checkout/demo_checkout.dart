import 'package:flutter/material.dart';

import '../../../services/api_service.dart';
import '../../../utils/formatters.dart';
import '../demo_payment_notice.dart';
import '../payment_method_tiles.dart';
import 'demo_checkout_data.dart';
import 'demo_confirm_step.dart';
import 'demo_steps.dart';

export 'demo_checkout_data.dart' show DemoChoice, DemoPay, paidByLabel;

enum _Screen { choose, method, confirm, failed }

/// The trial server's payment (no Razorpay keys there), laid out like Razorpay's
/// window: choose a way to pay → that method's step → approve or decline.
/// Labelled demo on every step; no money moves and no card, bank or wallet is
/// contacted. Used in checkout and in the consultation fee sheet.
class DemoCheckout extends StatefulWidget {
  final int amountPaise;
  final List<String> methods;
  /// banks and wallets, from GET /payments/options
  final Map<String, List<String>> providers;
  final DemoPay onPay;
  const DemoCheckout({super.key, required this.amountPaise, required this.methods, this.providers = const {}, required this.onPay});

  @override
  State<DemoCheckout> createState() => _DemoCheckoutState();
}

class _DemoCheckoutState extends State<DemoCheckout> {
  _Screen _screen = _Screen.choose;
  String _method = 'upi';
  DemoChoice? _choice;
  String? _vpa;
  String? _busy;
  String? _error;

  void _go(_Screen s) => setState(() {
        _screen = s;
        _error = null;
      });

  void _back() {
    if (_busy != null) return;
    _go(_screen == _Screen.confirm ? _Screen.method : _Screen.choose);
  }

  void _confirm(DemoChoice c, [String? vpa]) {
    _choice = c;
    _vpa = vpa;
    _go(_Screen.confirm);
  }

  Future<void> _answer(bool success) async {
    final c = _choice;
    if (c == null) return;
    setState(() {
      _busy = success ? 'success' : 'failure';
      _error = null;
    });
    try {
      final paid = await widget.onPay(c, success);
      if (!mounted) return;
      if (!paid) _go(_Screen.failed);
    } catch (e) {
      if (mounted) setState(() => _error = ApiService.errorMessage(e, fallback: 'We could not record the demo payment. Please try again.'));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  // Announced when a step opens (Android live region), and marked as a heading
  Widget _heading(String text) => Semantics(
        header: true,
        liveRegion: true,
        child: Text(text, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      );

  Widget _backLink(String label) => Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(
          onPressed: _busy == null ? _back : null,
          icon: const Icon(Icons.arrow_back, size: 18),
          label: Text(label),
        ),
      );

  Widget _methodStep() {
    final amount = widget.amountPaise;
    return switch (_method) {
      'upi' => DemoUpiStep(amountPaise: amount, onPay: (vpa) => _confirm(const DemoChoice('upi'), vpa)),
      'card' => DemoCardStep(amountPaise: amount, onPay: () => _confirm(const DemoChoice('card'))),
      _ => DemoProviderStep(
          key: ValueKey(_method),
          providers: widget.providers[_method] ?? const [],
          amountPaise: amount,
          onPay: (p) => _confirm(DemoChoice(_method, p)),
        ),
    };
  }

  @override
  Widget build(BuildContext context) {
    final body = switch (_screen) {
      _Screen.choose => [
          _heading('Choose how to pay ${formatPrice(widget.amountPaise)}'),
          const SizedBox(height: 10),
          PaymentMethodTiles(methods: widget.methods, onSelect: (m) {
            _method = m;
            _go(_Screen.method);
          }),
        ],
      _Screen.method => [
          _backLink('Change method'),
          _heading(methodStepTitles[_method] ?? 'Pay'),
          const SizedBox(height: 10),
          _methodStep(),
        ],
      _Screen.confirm => [
          _backLink('Go back'),
          DemoConfirmStep(
            choice: _choice!,
            vpa: _vpa,
            amountPaise: widget.amountPaise,
            busy: _busy,
            onAnswer: _answer,
            onRestart: () => _go(_Screen.choose),
            heading: _heading,
          ),
        ],
      _Screen.failed => [
          Row(children: [
            Icon(Icons.cancel_outlined, color: Colors.red.shade800),
            const SizedBox(width: 6),
            Expanded(child: _heading("Payment didn't go through")),
          ]),
          const SizedBox(height: 6),
          Semantics(liveRegion: true, child: const Text(demoFailedText, style: TextStyle(fontSize: 13))),
          const SizedBox(height: 12),
          ElevatedButton(onPressed: () => _go(_Screen.choose), child: const Text('Try again')),
        ],
    };
    // System back steps back inside the demo checkout before leaving it
    return PopScope(
      canPop: _screen == _Screen.choose,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _back();
      },
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const DemoPaymentNotice(),
        const SizedBox(height: 12),
        ...body,
        if (_error != null) ...[
          const SizedBox(height: 10),
          Text(_error!, style: TextStyle(fontSize: 13, color: Colors.red.shade900)),
        ],
      ]),
    );
  }
}
