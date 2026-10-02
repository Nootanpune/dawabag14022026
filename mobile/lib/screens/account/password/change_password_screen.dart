import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/password_gate.dart';
import '../../../providers/auth_provider.dart';
import '../../../services/api_service.dart';
import '../../../services/password_api.dart';
import 'change_password_form.dart';

/// Change password (Sprint 32). Opened from Account → Change password, or by
/// the router when the server says a temporary password from Dawabag's admin
/// must be replaced first ([required]; 403 PASSWORD_CHANGE_REQUIRED, C-44). In
/// that case there is no way back — only Sign out — and afterwards the person
/// continues to [next].
class ChangePasswordScreen extends ConsumerWidget {
  final bool required;
  final String? next;
  const ChangePasswordScreen({super.key, this.required = false, this.next});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final forced = required || auth.mustChangePassword;

    Future<String?> submit(String current, String newPassword) async {
      try {
        final data = await apiService.changePassword(current: current, next: newPassword);
        ref.read(authProvider.notifier).passwordChanged(data);
      } catch (e) {
        return ApiService.errorMessage(e, fallback: 'Could not change the password');
      }
      if (!context.mounted) return null;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password changed')));
      if (forced) {
        context.go(continueAfterPasswordChange(next));
      } else if (context.canPop()) {
        context.pop();
      } else {
        context.go('/account');
      }
      return null;
    }

    return PopScope(
      canPop: !forced,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Change password'),
          automaticallyImplyLeading: !forced,
        ),
        body: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (forced) ...[
                  const Text('Choose your own password',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 6),
                  Text(
                    'Your login was made by Dawabag with a temporary password. '
                    'Choose your own password to continue.',
                    style: TextStyle(fontSize: 14, color: Colors.grey.shade700),
                  ),
                  const SizedBox(height: 20),
                ],
                ChangePasswordForm(
                  mobile: auth.user?['mobile']?.toString(),
                  temporary: forced,
                  onSubmit: submit,
                ),
                if (forced) ...[
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: () async {
                      await ref.read(authProvider.notifier).logout();
                      if (context.mounted) context.go('/');
                    },
                    child: const Text('Sign out'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
