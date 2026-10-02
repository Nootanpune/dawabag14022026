import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../models/licence_draft.dart';
import '../../../services/photo_picker.dart';

/// A copy of a drug licence chosen on the phone (Sprint 34: photo OR PDF). It
/// is only uploaded to the server's private store, never kept by the app (C-41).
class LicenceCopy {
  final String path;
  final String name;
  final int size;
  const LicenceCopy({required this.path, required this.name, required this.size});

  bool get isPdf => name.toLowerCase().endsWith('.pdf');

  /// "PDF: licence.pdf" / "Photo: IMG_1.jpg"
  String get label => '${isPdf ? 'PDF' : 'Photo'}: $name';
}

/// Same rule as the server (POST /users/me/licences/:id/document): PDF, JPG or
/// PNG, up to 5 MB. A plain sentence, or null when the file can be sent.
String? licenceCopyProblem(LicenceCopy copy) {
  final lower = copy.name.toLowerCase();
  const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
  if (!allowed.any(lower.endsWith)) return 'Choose a PDF, JPG or PNG file.';
  if (copy.size > kLicenceFileMaxBytes) {
    return copy.isPdf
        ? 'This PDF is larger than 5 MB. Please choose a smaller file.'
        : 'This photo is larger than 5 MB. Please take a smaller photo.';
  }
  return null;
}

enum LicenceCopySource { camera, gallery, pdf }

Future<LicenceCopySource?> showLicenceCopySourceSheet(BuildContext context) =>
    showModalBottomSheet<LicenceCopySource>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const SizedBox(height: 8),
          ListTile(
            leading: const Icon(Icons.camera_alt),
            title: const Text('Take photo'),
            onTap: () => Navigator.pop(sheetContext, LicenceCopySource.camera),
          ),
          ListTile(
            leading: const Icon(Icons.photo_library),
            title: const Text('Choose from gallery'),
            onTap: () => Navigator.pop(sheetContext, LicenceCopySource.gallery),
          ),
          ListTile(
            leading: const Icon(Icons.picture_as_pdf_outlined),
            title: const Text('Choose a PDF'),
            onTap: () => Navigator.pop(sheetContext, LicenceCopySource.pdf),
          ),
          const SizedBox(height: 8),
        ]),
      ),
    );

/// Asks camera / gallery / PDF and returns the chosen file; null when cancelled.
Future<LicenceCopy?> pickLicenceCopy(BuildContext context) async {
  final source = await showLicenceCopySourceSheet(context);
  switch (source) {
    case null:
      return null;
    case LicenceCopySource.pdf:
      final result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['pdf']);
      final file = result?.files.firstOrNull;
      if (file == null || file.path == null) return null;
      return LicenceCopy(path: file.path!, name: file.name, size: file.size);
    case LicenceCopySource.camera:
    case LicenceCopySource.gallery:
      // Re-encoded as JPEG (no HEIC — Sprint 35)
      final photo = await pickPhotoForUpload(
          source == LicenceCopySource.camera ? ImageSource.camera : ImageSource.gallery);
      if (photo == null) return null;
      return LicenceCopy(path: photo.path, name: photo.name, size: await photo.length());
  }
}
