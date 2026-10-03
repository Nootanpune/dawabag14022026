import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../screens/checkout/widgets/prescription_step.dart' show pickPrescriptionImage;
import '../../utils/formatters.dart';

/// A file chosen for upload: only its path on the phone (the picker's own
/// copy) — the app sends it to the server and keeps nothing (C-41).
class PickedDocument {
  final String path;
  final String name;
  final int size;
  const PickedDocument({required this.path, required this.name, required this.size});
}

/// Refused before upload; [message] is shown as is.
class PickRefused implements Exception {
  final String message;
  const PickRefused(this.message);
  @override
  String toString() => message;
}

/// A photo from the camera or the gallery (re-encoded as JPEG, as for
/// prescriptions), or null when cancelled. Throws [PickRefused] above [maxBytes].
Future<PickedDocument?> pickPhotoDocument(BuildContext context, {required int maxBytes}) async {
  final file = await pickPrescriptionImage(context);
  if (file == null) return null;
  final size = await file.length();
  if (size > maxBytes) throw PickRefused('This photo is larger than ${formatMegabytes(maxBytes)}.');
  return PickedDocument(path: file.path, name: file.name, size: size);
}

/// A PDF from the phone's files, or null when cancelled. Throws [PickRefused].
Future<PickedDocument?> pickPdfDocument({required int maxBytes}) async {
  FilePickerResult? result;
  try {
    result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['pdf']);
  } catch (_) {
    throw const PickRefused('Could not open the file picker');
  }
  final file = result?.files.firstOrNull;
  if (file == null || file.path == null) return null;
  if (file.size > maxBytes) throw PickRefused('${file.name} is larger than ${formatMegabytes(maxBytes)}.');
  if (file.size == 0) throw const PickRefused('This file is empty. Please choose it again.');
  return PickedDocument(path: file.path!, name: file.name, size: file.size);
}
