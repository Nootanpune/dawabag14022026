import 'package:flutter/material.dart';
import '../config/theme.dart';

class PinCodeBanner extends StatefulWidget {
  final String pincode;
  final void Function(String) onPincodeChanged;

  const PinCodeBanner({super.key, required this.pincode, required this.onPincodeChanged});

  @override
  State<PinCodeBanner> createState() => _PinCodeBannerState();
}

class _PinCodeBannerState extends State<PinCodeBanner> {
  bool _editing = false;
  late TextEditingController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.pincode);
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  void _save() {
    final pin = _ctrl.text.trim();
    if (RegExp(r'^\d{6}$').hasMatch(pin)) {
      widget.onPincodeChanged(pin);
      setState(() => _editing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.pincode.isEmpty && !_editing) {
      return GestureDetector(
        onTap: () => setState(() { _editing = true; _ctrl.clear(); }),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: AppTheme.brandTeal50,
            border: Border.all(color: AppTheme.brandTeal100, style: BorderStyle.solid),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              const Icon(Icons.location_on_outlined, color: AppTheme.brandTeal, size: 16),
              const SizedBox(width: 8),
              const Expanded(
                child: Text('Enter pin code to check delivery',
                  style: TextStyle(fontSize: 13, color: AppTheme.brandTeal700)),
              ),
              const Icon(Icons.chevron_right, color: AppTheme.brandTeal, size: 18),
            ],
          ),
        ),
      );
    }

    if (_editing) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: AppTheme.brandTeal50,
          border: Border.all(color: AppTheme.brandTeal),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            const Icon(Icons.location_on, color: AppTheme.brandTeal, size: 16),
            const SizedBox(width: 8),
            Expanded(
              child: TextField(
                controller: _ctrl,
                keyboardType: TextInputType.number,
                maxLength: 6,
                autofocus: true,
                decoration: const InputDecoration(
                  counterText: '',
                  hintText: '6-digit pin code',
                  border: InputBorder.none,
                  isDense: true,
                  contentPadding: EdgeInsets.zero,
                ),
                style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                onSubmitted: (_) => _save(),
              ),
            ),
            IconButton(icon: const Icon(Icons.check, size: 18, color: AppTheme.brandTeal), onPressed: _save, padding: EdgeInsets.zero, constraints: const BoxConstraints()),
            const SizedBox(width: 4),
            IconButton(icon: Icon(Icons.close, size: 18, color: Colors.grey.shade500), onPressed: () => setState(() => _editing = false), padding: EdgeInsets.zero, constraints: const BoxConstraints()),
          ],
        ),
      );
    }

    return GestureDetector(
      onTap: () => setState(() { _ctrl.text = widget.pincode; _editing = true; }),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: AppTheme.brandTeal50,
          border: Border.all(color: AppTheme.brandTeal100),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            const Icon(Icons.location_on, color: AppTheme.brandTeal, size: 16),
            const SizedBox(width: 8),
            Expanded(
              child: Text.rich(TextSpan(
                style: const TextStyle(fontSize: 13, color: AppTheme.brandTeal700),
                children: [
                  const TextSpan(text: 'Delivering to '),
                  TextSpan(text: widget.pincode,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                ],
              )),
            ),
            const Text('Change', style: TextStyle(fontSize: 12, color: AppTheme.brandTeal, fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}
