import 'package:image_picker/image_picker.dart';

/// Camera / gallery photo for an upload. Asking for a quality and a size makes
/// image_picker re-encode the photo, which turns an iPhone's HEIC into JPEG and
/// keeps it well under the 5 / 10 MB limits. The file goes only to the server
/// (C-41); [prepareUpload] (upload_file.dart) still checks the bytes before sending.
Future<XFile?> pickPhotoForUpload(ImageSource source) => ImagePicker().pickImage(
      source: source,
      imageQuality: 85,
      maxWidth: 2400,
      maxHeight: 2400,
      requestFullMetadata: false,
    );
