import 'dart:io';

/// Upload files are typed by their own bytes (Sprint 35). The server reads the
/// first bytes of every prescription, licence copy and KYC document and refuses
/// a file whose declared type does not match them (backend utils/documentCheck.ts,
/// Sprint 34 review; C-41). An iPhone photo is often HEIC even when it is called
/// ".jpg", so the app sends the type the bytes show and refuses HEIC before upload.

/// What a file's first bytes say it is.
enum UploadKind { pdf, jpeg, png, heic, unknown }

/// How many leading bytes [sniffUploadKind] needs ("%PDF-" may sit up to 1 KB in).
const int kUploadSniffBytes = 1024;

/// The server's own refusal words for anything that is not PDF / JPG / PNG.
const String kOnlyPdfJpgPng = 'Only PDF, JPG and PNG files are allowed';

/// HEIC / HEIF photos cannot be read by the server.
const String kHeicRefused = 'This photo is in HEIC format, which we cannot open. Please take or choose the photo again '
    'from the app (it is sent as JPG), or send a JPG, PNG or PDF.';

/// Reads the type from the leading bytes, as the server does.
UploadKind sniffUploadKind(List<int> head) {
  bool startsWith(List<int> sig, [int offset = 0]) {
    if (head.length < offset + sig.length) return false;
    for (var i = 0; i < sig.length; i++) {
      if (head[offset + i] != sig[i]) return false;
    }
    return true;
  }

  if (startsWith(const [0xFF, 0xD8, 0xFF])) return UploadKind.jpeg;
  if (startsWith(const [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return UploadKind.png;
  // ISO media file ("....ftyp<brand>"): HEIC / HEIF / AVIF photos
  if (startsWith('ftyp'.codeUnits, 4) && head.length >= 12) {
    final brand = String.fromCharCodes(head.sublist(8, 12));
    const heif = {'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'avif', 'avis'};
    if (heif.contains(brand)) return UploadKind.heic;
  }
  // "%PDF-" in the first KB (some scanners put a few bytes before it)
  final pdf = '%PDF-'.codeUnits;
  final end = head.length < kUploadSniffBytes ? head.length : kUploadSniffBytes;
  for (var i = 0; i + pdf.length <= end; i++) {
    if (startsWith(pdf, i)) return UploadKind.pdf;
  }
  return UploadKind.unknown;
}

/// A file ready to send: the content type and file name agree with its bytes.
class PreparedUpload {
  final String path;
  final String filename;
  final String contentType;
  const PreparedUpload({required this.path, required this.filename, required this.contentType});
}

/// The app refuses the file before upload; [message] is shown as is.
class UploadRefused implements Exception {
  final String message;
  const UploadRefused(this.message);
  @override
  String toString() => message;
}

/// Content type and file name for [head] (the file's first bytes). The name
/// keeps its stem and gets the right extension ("IMG_0042.HEIC" holding JPEG
/// bytes is sent as "IMG_0042.jpg", image/jpeg). Throws [UploadRefused].
PreparedUpload describeUpload(List<int> head, {required String path, required String filename}) {
  final kind = sniffUploadKind(head);
  final (contentType, ext) = switch (kind) {
    UploadKind.jpeg => ('image/jpeg', 'jpg'),
    UploadKind.png => ('image/png', 'png'),
    UploadKind.pdf => ('application/pdf', 'pdf'),
    UploadKind.heic => throw const UploadRefused(kHeicRefused),
    UploadKind.unknown => throw const UploadRefused(kOnlyPdfJpgPng),
  };
  return PreparedUpload(path: path, filename: withExtension(filename, ext), contentType: contentType);
}

/// [filename] with extension [ext] ("scan.JPEG" + jpg stays "scan.JPEG").
String withExtension(String filename, String ext) {
  final name = filename.trim().isEmpty ? 'document' : filename.trim();
  final dot = name.lastIndexOf('.');
  final stem = dot > 0 ? name.substring(0, dot) : name;
  final current = dot > 0 ? name.substring(dot + 1).toLowerCase() : '';
  final same = current == ext || (ext == 'jpg' && current == 'jpeg');
  return same ? name : '$stem.$ext';
}

/// Reads the first bytes of the file at [path] and describes it ([describeUpload]).
Future<PreparedUpload> prepareUpload(String path, String filename) async {
  final head = <int>[];
  try {
    await for (final chunk in File(path).openRead(0, kUploadSniffBytes)) {
      head.addAll(chunk);
    }
  } on FileSystemException {
    throw UploadRefused('Could not read $filename');
  }
  return describeUpload(head, path: path, filename: filename);
}
