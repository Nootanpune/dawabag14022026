import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../providers/auth_provider.dart';
import '../../../widgets/brand/brand_backdrop.dart';
import 'register_constants.dart';
import 'register_controller.dart';
import 'register_widgets.dart';
import 'step_details.dart';
import 'step_documents.dart';
import 'step_otp.dart';
import 'step_type.dart';
import 'step_upload.dart';
import 'submitted_view.dart';

/// 4-step registration:
/// 1. customer type → 2. details (POST /auth/register for customers)
/// → 3. documents (B2B / doctor only; POST /auth/register on continue)
/// → 4. OTP verify, then KYC document upload → application submitted.
///
/// This widget only hosts the flow (app bar, back handling, step switch);
/// state and logic live in [RegisterController].
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  late final RegisterController _c = RegisterController(
    verifyOtp: (mobile, otp) =>
        ref.read(authProvider.notifier).verifyOTPAndSaveTokens(mobile, otp),
    onFinished: _finish,
    onMessage: _snack,
  );

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  /// Publishes the session to the auth provider and goes home.
  void _finish(Map<String, dynamic> authData, String? message) {
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    ref.read(authProvider.notifier).completeSignIn(authData);
    context.go('/');
    if (message != null) {
      messenger.showSnackBar(SnackBar(content: Text(message)));
    }
  }

  void _snack(String message, bool isError) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: isError ? Colors.red : null),
    );
  }

  /// Returns true when the back press was handled inside the flow.
  Future<bool> _handleBack() async {
    final c = _c;
    if (c.isSubmitting || c.isVerifying) return true;
    if (c.step == RegisterStep.type) return false;
    if (c.step == RegisterStep.details) {
      c.goTo(RegisterStep.type);
    } else if (c.step == RegisterStep.documents) {
      if (c.isRegistered) {
        await _confirmLeave();
      } else {
        c.goTo(RegisterStep.details);
      }
    } else if (c.step == RegisterStep.otp) {
      // Once verified the account is live; the user can only submit or skip.
      if (!c.isVerified) {
        if (c.isCustomer) {
          await _confirmLeave();
        } else {
          c.goTo(RegisterStep.documents);
        }
      }
    } else if (c.step == RegisterStep.submitted) {
      c.finish();
    }
    return true;
  }

  Future<void> _onAppBarBack() async {
    final handled = await _handleBack();
    if (handled || !mounted) return;
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/auth/login');
    }
  }

  Future<void> _confirmLeave() async {
    final leave = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Leave registration?'),
        content: const Text(
          'Your account has been created but your mobile number is not verified yet. '
          'You can verify it later by signing in with your mobile number and password.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Stay')),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: const Text('Leave')),
        ],
      ),
    );
    if (leave != true || !mounted) return;
    context.go('/auth/login');
  }

  String _title(RegisterController c) => switch (c.step) {
        RegisterStep.type => 'Create account',
        RegisterStep.details => 'Your details',
        RegisterStep.documents => 'Upload documents',
        RegisterStep.otp => c.isVerified ? 'Uploading documents' : 'Verify mobile',
        RegisterStep.submitted => 'Application submitted',
      };

  Widget _stepBody(RegisterController c) => switch (c.step) {
        RegisterStep.type => StepType(c: c),
        RegisterStep.details => StepDetails(c: c, onMessage: _snack),
        RegisterStep.documents => StepDocuments(c: c),
        RegisterStep.otp => c.isVerified ? StepUpload(c: c) : StepOtp(c: c),
        RegisterStep.submitted => SubmittedView(c: c),
      };

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (context, _) {
        final c = _c;
        final showBack =
            c.step != RegisterStep.submitted && !(c.step == RegisterStep.otp && c.isVerified);
        return Scaffold(
          appBar: AppBar(
            title: Text(_title(c)),
            automaticallyImplyLeading: false,
            leading: showBack
                ? IconButton(icon: const Icon(Icons.arrow_back), onPressed: _onAppBarBack)
                : null,
          ),
          // Sprint 35: DAWA BAG brand backdrop, as the sign-in pages
          body: BackButtonListener(
            onBackButtonPressed: _handleBack,
            child: BrandBackdrop(child: SafeArea(
              child: Column(
                children: [
                  if (c.step != RegisterStep.submitted)
                    RegisterStepIndicator(steps: c.visibleSteps, current: c.step),
                  Expanded(child: _stepBody(c)),
                ],
              ),
            )),
          ),
        );
      },
    );
  }
}
