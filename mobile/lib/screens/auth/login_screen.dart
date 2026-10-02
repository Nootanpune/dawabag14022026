import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';
import '../../config/password_gate.dart';
import '../../config/theme.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _mobileCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _showPassword = false;

  @override
  void dispose() {
    _mobileCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;

    final success = await ref.read(authProvider.notifier).login(
      _mobileCtrl.text.trim(),
      _passwordCtrl.text,
    );

    if (!mounted) return;

    if (success) {
      final auth = ref.read(authProvider);
      final role = auth.user?['role'];
      final home = role == 'admin' || role == 'super_admin'
          ? '/admin'
          : role == 'doctor'
              ? '/doctor/portal'
              : '/';
      // A temporary password from Dawabag's admin is replaced first (Sprint 32)
      context.go(auth.mustChangePassword ? changePasswordLocation(required: true, next: home) : home);
    } else {
      final error = ref.read(authProvider).error;
      if (error?.contains('OTP') == true) {
        context.push('/auth/otp?mobile=${_mobileCtrl.text.trim()}');
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error ?? 'Login failed'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const SizedBox(height: 40),

              // Logo
              Container(
                width: 64, height: 64,
                decoration: BoxDecoration(
                  color: AppTheme.brandGreen,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Center(
                  child: Text('D', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 28)),
                ),
              ),
              const SizedBox(height: 16),
              Text('dawabag',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                  color: AppTheme.brandGreen, fontWeight: FontWeight.w700,
                )),
              const SizedBox(height: 6),
              Text('Your trusted online pharmacy',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey)),
              const SizedBox(height: 40),

              // Form
              Form(
                key: _formKey,
                child: Column(
                  children: [
                    // Mobile
                    TextFormField(
                      controller: _mobileCtrl,
                      keyboardType: TextInputType.phone,
                      maxLength: 10,
                      decoration: const InputDecoration(
                        labelText: 'Mobile number',
                        hintText: '9876543210',
                        prefixText: '+91  ',
                        counterText: '',
                      ),
                      validator: (v) {
                        if (v == null || v.isEmpty) return 'Mobile number required';
                        if (!RegExp(r'^[6-9]\d{9}$').hasMatch(v)) return 'Enter valid 10-digit number';
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),

                    // Password
                    TextFormField(
                      controller: _passwordCtrl,
                      obscureText: !_showPassword,
                      decoration: InputDecoration(
                        labelText: 'Password',
                        hintText: '••••••••',
                        suffixIcon: IconButton(
                          icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility, size: 20),
                          onPressed: () => setState(() => _showPassword = !_showPassword),
                        ),
                      ),
                      validator: (v) => (v == null || v.isEmpty) ? 'Password required' : null,
                    ),
                    const SizedBox(height: 24),

                    // Login button
                    ElevatedButton(
                      onPressed: authState.isLoading ? null : _login,
                      child: authState.isLoading
                          ? const SizedBox(width: 20, height: 20,
                              child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Text('Sign in'),
                    ),
                    const SizedBox(height: 16),

                    // Register link
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text("Don't have an account? ",
                          style: TextStyle(color: Colors.grey.shade600, fontSize: 14)),
                        GestureDetector(
                          onTap: () => context.push('/auth/register'),
                          child: const Text('Register',
                            style: TextStyle(color: AppTheme.brandGreen, fontWeight: FontWeight.w600, fontSize: 14)),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
