import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../models/licence_draft.dart';
import '../../../providers/auth_provider.dart';
import '../../../services/api_service.dart';
import '../../../services/licence_api.dart';
import 'licence_copy_picker.dart';
import 'licence_renewal_form.dart';

/// Send a renewed or another drug licence from the app (Sprint 32): POST
/// /users/me/licences, then the optional photo or PDF to POST
/// /users/me/licences/:id/document — the same calls as the web. Pops with
/// true when sent so the list reloads from the server.
class LicenceRenewalScreen extends ConsumerWidget {
  const LicenceRenewalScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final customerType = ref.watch(authProvider.select((s) => s.customerType));

    Future<String?> submit(LicenceDraft draft, LicenceCopy? copy) async {
      final ({List<String> ids, String message}) sent;
      try {
        sent = await apiService.submitLicences([draft.toBody()]);
      } catch (e) {
        return ApiService.errorMessage(e, fallback: 'Could not send the licence');
      }
      var message = sent.message;
      if (copy != null && sent.ids.isNotEmpty) {
        try {
          await apiService.uploadLicenceCopy(sent.ids.first, filePath: copy.path, filename: copy.name);
        } catch (e) {
          final why = ApiService.errorMessage(e, fallback: 'the upload failed');
          message = 'Licence sent, but the copy did not upload ($why). You can add it from the list.';
        }
      }
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
        context.pop(true);
      }
      return null;
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Send a licence')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: LicenceRenewalForm(customerType: customerType, pickCopy: () => pickLicenceCopy(context), onSubmit: submit),
        ),
      ),
    );
  }
}
