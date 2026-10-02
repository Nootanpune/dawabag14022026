import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../config/theme.dart';

/// Six single-digit boxes used for mobile OTP entry.
///
/// Use a `GlobalKey<OtpInputState>` to call [OtpInputState.clear] after a
/// failed verification.
class OtpInput extends StatefulWidget {
  final int length;
  final bool enabled;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onCompleted;

  const OtpInput({
    super.key,
    this.length = 6,
    this.enabled = true,
    this.onChanged,
    this.onCompleted,
  });

  @override
  State<OtpInput> createState() => OtpInputState();
}

class OtpInputState extends State<OtpInput> {
  late final List<TextEditingController> _ctrls =
      List.generate(widget.length, (_) => TextEditingController());
  late final List<FocusNode> _nodes = List.generate(widget.length, (_) => FocusNode());

  String get value => _ctrls.map((c) => c.text).join();

  void clear() {
    for (final c in _ctrls) {
      c.clear();
    }
    if (_nodes.isNotEmpty) _nodes[0].requestFocus();
    widget.onChanged?.call(value);
  }

  @override
  void dispose() {
    for (final c in _ctrls) {
      c.dispose();
    }
    for (final n in _nodes) {
      n.dispose();
    }
    super.dispose();
  }

  void _onChanged(int index, String val) {
    if (val.length == 1 && index < widget.length - 1) {
      _nodes[index + 1].requestFocus();
    } else if (val.isEmpty && index > 0) {
      _nodes[index - 1].requestFocus();
    }
    final otp = value;
    widget.onChanged?.call(otp);
    if (otp.length == widget.length) widget.onCompleted?.call(otp);
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: List.generate(widget.length, (i) => SizedBox(
        width: 46,
        height: 56,
        child: TextFormField(
          controller: _ctrls[i],
          focusNode: _nodes[i],
          enabled: widget.enabled,
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          maxLength: 1,
          autofocus: i == 0,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
          decoration: InputDecoration(
            counterText: '',
            contentPadding: EdgeInsets.zero,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            // The theme's pill fields are for full-width inputs; digit boxes stay square-ish
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide(color: Colors.grey.shade400),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
              borderSide: const BorderSide(color: AppTheme.brandTeal, width: 2),
            ),
          ),
          onChanged: (v) => _onChanged(i, v),
        ),
      )),
    );
  }
}
