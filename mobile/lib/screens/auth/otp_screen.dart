import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';
import '../../config/theme.dart';

class OTPScreen extends ConsumerStatefulWidget {
  final String mobile;
  const OTPScreen({super.key, required this.mobile});

  @override
  ConsumerState<OTPScreen> createState() => _OTPScreenState();
}

class _OTPScreenState extends ConsumerState<OTPScreen> {
  final List<TextEditingController> _ctrls = List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _nodes = List.generate(6, (_) => FocusNode());
  bool _isLoading = false;

  @override
  void dispose() {
    for (final c in _ctrls) c.dispose();
    for (final n in _nodes) n.dispose();
    super.dispose();
  }

  String get _otp => _ctrls.map((c) => c.text).join();

  void _onChanged(int index, String val) {
    if (val.length == 1 && index < 5) {
      _nodes[index + 1].requestFocus();
    } else if (val.isEmpty && index > 0) {
      _nodes[index - 1].requestFocus();
    }
    if (_otp.length == 6) _verify();
  }

  Future<void> _verify() async {
    if (_otp.length != 6) return;
    setState(() => _isLoading = true);
    final success = await ref.read(authProvider.notifier).verifyOTP(widget.mobile, _otp);
    if (!mounted) return;
    if (success) {
      context.go('/');
    } else {
      for (final c in _ctrls) c.clear();
      _nodes[0].requestFocus();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Invalid OTP. Try again.'), backgroundColor: Colors.red),
      );
    }
    if (mounted) setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Verify mobile')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 16),
            Text('Enter the OTP sent to',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 15)),
            const SizedBox(height: 4),
            Text('+91 ${widget.mobile}',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
            const SizedBox(height: 36),

            // OTP boxes
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: List.generate(6, (i) => SizedBox(
                width: 46,
                height: 56,
                child: TextFormField(
                  controller: _ctrls[i],
                  focusNode: _nodes[i],
                  keyboardType: TextInputType.number,
                  maxLength: 1,
                  autofocus: i == 0,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
                  decoration: InputDecoration(
                    counterText: '',
                    contentPadding: EdgeInsets.zero,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: AppTheme.brandGreen, width: 2),
                    ),
                  ),
                  onChanged: (v) => _onChanged(i, v),
                ),
              )),
            ),
            const SizedBox(height: 36),

            ElevatedButton(
              onPressed: (_isLoading || _otp.length < 6) ? null : _verify,
              child: _isLoading
                  ? const SizedBox(width: 20, height: 20,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Verify'),
            ),
          ],
        ),
      ),
    );
  }
}
