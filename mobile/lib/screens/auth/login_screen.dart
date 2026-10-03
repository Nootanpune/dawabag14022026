import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';
import '../../config/sign_in_home.dart';
import '../../config/theme.dart';
import '../../services/api_service.dart';
import '../../services/otp_errors.dart';
import '../../services/registration_api.dart';
import '../../utils/mobile_number.dart';
import '../../widgets/brand/auth_page.dart';
import '../../widgets/brand/labeled_field.dart';
import 'two_factor/two_factor_screen.dart' show kTwoFactorPath;

/// How the person signs in: mobile + password, or mobile + OTP.
enum LoginMethod { password, otp }

/// Sign in (Sprint 35 DAWA BAG restyle after the owner's mock-up). Same flows
/// as before: mobile + password (an unverified mobile is sent to the OTP
/// screen), or mobile + OTP (POST /auth/send-otp, then /auth/verify-otp).
/// Sprint 40: when the server cannot send text messages (SMS_NOT_CONFIGURED)
/// its sentence is shown and the screen goes back to password sign-in.
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
  bool _sendingOtp = false;
  LoginMethod _method = LoginMethod.password;

  /// The server's sentence when codes cannot be sent by text (Sprint 40).
  String? _smsNotice;

  @override
  void dispose() {
    _mobileCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  void _showError(String message) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message), backgroundColor: Colors.red),
      );

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;

    final success = await ref.read(authProvider.notifier).login(
          _mobileCtrl.text.trim(),
          _passwordCtrl.text,
        );

    if (!mounted) return;

    if (success) {
      final auth = ref.read(authProvider);
      // A temporary password from Dawabag's admin is replaced first (Sprint 32)
      context.go(homeAfterSignIn(auth.user?['role'] as String?, mustChangePassword: auth.mustChangePassword));
    } else if (ref.read(authProvider).challenge != null) {
      // Sprint 42: a staff or partner login gives the second step before any session
      context.push(kTwoFactorPath);
    } else {
      final error = ref.read(authProvider).error;
      if (error?.contains('OTP') == true) {
        context.push('/auth/otp?mobile=${_mobileCtrl.text.trim()}');
      } else {
        _showError(error ?? 'Login failed');
      }
    }
  }

  /// Sign in with OTP: the server sends it, the OTP screen checks it.
  Future<void> _sendOtp() async {
    if (!_formKey.currentState!.validate()) return;
    final mobile = _mobileCtrl.text.trim();
    setState(() => _sendingOtp = true);
    try {
      await apiService.sendOtp(mobile);
      if (mounted) context.push('/auth/otp?mobile=$mobile');
    } catch (e) {
      if (!mounted) return;
      if (isSmsNotConfigured(e)) {
        // No code can arrive: back to the password path, with the server's words
        setState(() {
          _smsNotice = smsNotConfiguredMessage(e);
          _method = LoginMethod.password;
        });
      } else {
        _showError(ApiService.errorMessage(e, fallback: 'Could not send the OTP'));
      }
    } finally {
      if (mounted) setState(() => _sendingOtp = false);
    }
  }

  Widget _spinner() => const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2));

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final byPassword = _method == LoginMethod.password;

    return AuthPage(
      showBack: true,
      children: [
        SegmentedButton<LoginMethod>(
          segments: const [
            ButtonSegment(value: LoginMethod.password, label: Text('Password'), icon: Icon(Icons.lock_outline)),
            ButtonSegment(value: LoginMethod.otp, label: Text('OTP'), icon: Icon(Icons.sms_outlined)),
          ],
          selected: {_method},
          showSelectedIcon: false,
          onSelectionChanged: (s) => setState(() => _method = s.first),
        ),
        const SizedBox(height: 20),
        // Sprint 42: why the sign-in or session ended (expired step, two-step now required)
        if (authState.notice != null) ...[
          SmsNotice(authState.notice!),
          const SizedBox(height: 16),
        ],
        if (_smsNotice != null && byPassword) ...[
          SmsNotice(_smsNotice!),
          const SizedBox(height: 16),
        ],
        Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              LabeledField(
                label: 'Mobile number',
                child: TextFormField(
                  controller: _mobileCtrl,
                  keyboardType: TextInputType.phone,
                  maxLength: 10,
                  autofillHints: const [AutofillHints.telephoneNumberNational],
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: const InputDecoration(
                    hintText: '9876543210',
                    prefixText: '+91  ',
                    counterText: '',
                    suffixIcon: Icon(Icons.smartphone_outlined),
                  ),
                  validator: mobileProblem,
                ),
              ),
              const SizedBox(height: 16),
              if (byPassword) ...[
                LabeledField(
                  label: 'Password',
                  child: TextFormField(
                    controller: _passwordCtrl,
                    obscureText: !_showPassword,
                    autofillHints: const [AutofillHints.password],
                    decoration: InputDecoration(
                      suffixIcon: IconButton(
                        tooltip: _showPassword ? 'Hide password' : 'Show password',
                        icon: Icon(_showPassword ? Icons.visibility_off : Icons.visibility, size: 20),
                        onPressed: () => setState(() => _showPassword = !_showPassword),
                      ),
                    ),
                    validator: (v) => (v == null || v.isEmpty) ? 'Password required' : null,
                  ),
                ),
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () {
                      final m = _mobileCtrl.text.trim();
                      context.push(m.isEmpty ? '/auth/forgot-password' : '/auth/forgot-password?mobile=$m');
                    },
                    child: const Text('Forgot password?'),
                  ),
                ),
                const SizedBox(height: 8),
                ElevatedButton(
                  onPressed: authState.isLoading ? null : _login,
                  child: authState.isLoading ? _spinner() : const Text('Sign in'),
                ),
              ] else ...[
                Text("If this number has a Dawabag account, we'll send a 6-digit code to it.",
                    style: TextStyle(fontSize: 13.5, color: AppTheme.muted(context))),
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: _sendingOtp ? null : _sendOtp,
                  child: _sendingOtp ? _spinner() : const Text('Send OTP'),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 20),
        const _OrDivider(),
        const SizedBox(height: 20),
        OutlinedButton(
          onPressed: () => context.push('/auth/register'),
          child: const Text('Create an account'),
        ),
      ],
    );
  }
}

/// The server's "text-message codes are not switched on" sentence, kept on
/// screen above the password fields (Sprint 40).
class SmsNotice extends StatelessWidget {
  final String message;
  const SmsNotice(this.message, {super.key});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.secondaryContainer,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(Icons.info_outline, size: 20, color: Theme.of(context).colorScheme.onSecondaryContainer),
          const SizedBox(width: 10),
          Expanded(
            child: Text(message,
                style: TextStyle(fontSize: 13.5, height: 1.35, color: Theme.of(context).colorScheme.onSecondaryContainer)),
          ),
        ]),
      );
}

class _OrDivider extends StatelessWidget {
  const _OrDivider();

  @override
  Widget build(BuildContext context) => Row(children: [
        const Expanded(child: Divider()),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text('OR', style: TextStyle(fontSize: 12, color: AppTheme.muted(context))),
        ),
        const Expanded(child: Divider()),
      ]);
}
