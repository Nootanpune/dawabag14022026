import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../services/api_service.dart';
import '../../config/theme.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _mobileCtrl = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  final _referralCtrl = TextEditingController();
  bool _showPassword = false;
  bool _isLoading = false;

  @override
  void dispose() {
    _nameCtrl.dispose(); _mobileCtrl.dispose(); _emailCtrl.dispose();
    _passwordCtrl.dispose(); _confirmCtrl.dispose(); _referralCtrl.dispose();
    super.dispose();
  }

  Future<void> _register() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isLoading = true);
    try {
      await apiService.dio.post('/auth/register', data: {
        'full_name': _nameCtrl.text.trim(),
        'mobile': _mobileCtrl.text.trim(),
        if (_emailCtrl.text.isNotEmpty) 'email': _emailCtrl.text.trim(),
        'password': _passwordCtrl.text,
        'role': 'customer',
        if (_referralCtrl.text.isNotEmpty) 'referral_code': _referralCtrl.text.trim().toUpperCase(),
      });
      if (!mounted) return;
      context.push('/auth/otp?mobile=${_mobileCtrl.text.trim()}');
    } catch (e) {
      if (!mounted) return;
      final msg = (e as dynamic).response?.data?['error'] ?? 'Registration failed';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: Colors.red),
      );
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create account')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _field(_nameCtrl, 'Full name', hint: 'Rajesh Shah',
                validator: (v) => (v == null || v.length < 2) ? 'Name too short' : null),
              const SizedBox(height: 14),
              _mobileField(),
              const SizedBox(height: 14),
              _field(_emailCtrl, 'Email (optional)', hint: 'rajesh@example.com',
                keyboard: TextInputType.emailAddress),
              const SizedBox(height: 14),
              _passwordField(_passwordCtrl, 'Password'),
              const SizedBox(height: 14),
              _field(_confirmCtrl, 'Confirm password', obscure: true,
                validator: (v) => v != _passwordCtrl.text ? 'Passwords do not match' : null),
              const SizedBox(height: 14),
              _field(_referralCtrl, 'Referral code (optional)', hint: 'e.g. RAJA20'),
              const SizedBox(height: 28),
              ElevatedButton(
                onPressed: _isLoading ? null : _register,
                child: _isLoading
                    ? const SizedBox(width: 20, height: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : const Text('Create account'),
              ),
              const SizedBox(height: 16),
              Center(
                child: GestureDetector(
                  onTap: () => context.push('/auth/login'),
                  child: RichText(
                    text: TextSpan(
                      style: TextStyle(color: Colors.grey.shade600, fontSize: 14),
                      children: const [
                        TextSpan(text: 'Already have an account? '),
                        TextSpan(text: 'Sign in',
                          style: TextStyle(color: AppTheme.brandGreen, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _field(TextEditingController ctrl, String label, {
    String? hint, TextInputType? keyboard, bool obscure = false,
    String? Function(String?)? validator,
  }) => TextFormField(
    controller: ctrl,
    keyboardType: keyboard,
    obscureText: obscure,
    decoration: InputDecoration(labelText: label, hintText: hint),
    validator: validator,
  );

  Widget _mobileField() => TextFormField(
    controller: _mobileCtrl,
    keyboardType: TextInputType.phone,
    maxLength: 10,
    decoration: const InputDecoration(labelText: 'Mobile number', prefixText: '+91  ', counterText: ''),
    validator: (v) => (v == null || !RegExp(r'^[6-9]\d{9}$').hasMatch(v))
        ? 'Enter valid 10-digit number' : null,
  );

  Widget _passwordField(TextEditingController ctrl, String label) => TextFormField(
    controller: ctrl,
    obscureText: !_showPassword,
    decoration: InputDecoration(
      labelText: label,
      suffixIcon: IconButton(
        icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility, size: 20),
        onPressed: () => setState(() => _showPassword = !_showPassword),
      ),
    ),
    validator: (v) => (v == null || v.length < 8) ? 'Minimum 8 characters' : null,
  );
}
