import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../models/licence_draft.dart';
import '../../../providers/auth_provider.dart';
import '../../../services/api_service.dart';
import '../../../services/licence_api.dart';
import '../../checkout/widgets/prescription_step.dart' show showPrescriptionSourceSheet;
import 'licence_renewal_form.dart';

/// Send a renewed or another drug licence from the app (Sprint 32): POST
/// /users/me/licences, then the optional photo to POST
/// /users/me/licences/:id/document — the same calls as the web. Pops with
/// true when sent so the list reloads from the server.
class LicenceRenewalScreen extends ConsumerWidget {
  const LicenceRenewalScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final customerType = ref.watch(authProvider.select((s) => s.customerType));

    Future<XFile?> pickPhoto() async {
      final source = await showPrescriptionSourceSheet(context);
      if (source == null) return null;
      return ImagePicker().pickImage(source: source, imageQuality: 85);
    }

    Future<String?> submit(LicenceDraft draft, XFile? photo) async {
      final ({List<String> ids, String message}) sent;
      try {
        sent = await apiService.submitLicences([draft.toBody()]);
      } catch (e) {
        return ApiService.errorMessage(e, fallback: 'Could not send the licence');
      }
      var message = sent.message;
      if (photo != null && sent.ids.isNotEmpty) {
        try {
          await apiService.uploadLicenceCopy(sent.ids.first, filePath: photo.path, filename: photo.name);
        } catch (e) {
          final why = ApiService.errorMessage(e, fallback: 'the upload failed');
          message = 'Licence sent, but the photo did not upload ($why). You can add it from the list.';
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
          child: LicenceRenewalForm(customerType: customerType, pickPhoto: pickPhoto, onSubmit: submit),
        ),
      ),
    );
  }
}
