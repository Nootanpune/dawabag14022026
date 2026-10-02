import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/services/api_service.dart';
import 'package:dawabag/services/api_utils.dart';
import 'package:dawabag/services/licence_api.dart';
import 'package:dawabag/services/prescription_api.dart';
import 'package:dawabag/services/registration_api.dart';
import 'package:dawabag/services/upload_file.dart';

// Sprint 35: the server types every upload by its bytes and refuses a HEIC
// photo declared as image/jpeg (backend utils/documentCheck.ts). The app sends
// the type the bytes show, fixes the file name, and refuses HEIC before upload.

final _jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, ...ascii.encode('JFIF'), 0x00, 1, 2, 3];
final _png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, ...ascii.encode('IHDR')];
final _pdf = latin1.encode('%PDF-1.7\n%âãÏÓ\n1 0 obj\n');
// An iPhone photo: ISO media box "ftyp" with the "heic" brand
final _heic = [0x00, 0x00, 0x00, 0x18, ...ascii.encode('ftypheic'), 0, 0, 0, 0, ...ascii.encode('mif1heic')];

/// Records what was sent and answers 201 with an id.
class _RecordingAdapter implements HttpClientAdapter {
  final requests = <({String path, String? contentType, String body})>[];

  @override
  Future<ResponseBody> fetch(
      RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final bytes = <int>[];
    if (requestStream != null) {
      await for (final chunk in requestStream) {
        bytes.addAll(chunk);
      }
    }
    requests.add((path: options.path, contentType: options.contentType, body: latin1.decode(bytes)));
    return ResponseBody.fromString(
        jsonEncode({
          'success': true,
          'data': {'id': 'rx1'}
        }),
        201,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType]
        });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  group('type from the first bytes (as the server reads them)', () {
    test('JPEG, PNG, PDF', () {
      expect(sniffUploadKind(_jpeg), UploadKind.jpeg);
      expect(sniffUploadKind(_png), UploadKind.png);
      expect(sniffUploadKind(_pdf), UploadKind.pdf);
      // "%PDF-" a few bytes in, as some scanners write it
      expect(sniffUploadKind([0x0A, 0x0D, ..._pdf]), UploadKind.pdf);
    });
    test('HEIC / HEIF and unknown', () {
      expect(sniffUploadKind(_heic), UploadKind.heic);
      expect(sniffUploadKind([0, 0, 0, 0x1C, ...ascii.encode('ftypmif1'), 0, 0, 0, 0]), UploadKind.heic);
      expect(sniffUploadKind(ascii.encode('<html><script>')), UploadKind.unknown);
      expect(sniffUploadKind(const []), UploadKind.unknown);
    });
  });

  group('content type and name agree with the bytes', () {
    test('JPEG bytes named .HEIC go as image/jpeg, .jpg', () {
      final p = describeUpload(_jpeg, path: '/x', filename: 'IMG_0042.HEIC');
      expect(p.contentType, 'image/jpeg');
      expect(p.filename, 'IMG_0042.jpg');
    });
    test('right names are kept', () {
      expect(describeUpload(_jpeg, path: '/x', filename: 'scan.JPEG').filename, 'scan.JPEG');
      expect(describeUpload(_png, path: '/x', filename: 'licence.png').contentType, 'image/png');
      expect(describeUpload(_pdf, path: '/x', filename: 'rx').filename, 'rx.pdf');
      expect(describeUpload(_png, path: '/x', filename: 'photo.jpg').filename, 'photo.png');
    });
    test('HEIC bytes are refused, even when named .jpg', () {
      expect(() => describeUpload(_heic, path: '/x', filename: 'IMG_0042.jpg'),
          throwsA(isA<UploadRefused>().having((e) => e.message, 'message', contains('HEIC'))));
      expect(() => describeUpload(ascii.encode('MZ...'), path: '/x', filename: 'a.pdf'),
          throwsA(isA<UploadRefused>().having((e) => e.message, 'message', kOnlyPdfJpgPng)));
    });
    test('the refusal is shown in plain words', () {
      expect(apiErrorMessage(const UploadRefused(kHeicRefused), fallback: 'Upload failed'), kHeicRefused);
    });
  });

  group('every upload sends the type its bytes show', () {
    late Directory dir;
    late _RecordingAdapter adapter;
    setUp(() {
      dir = Directory.systemTemp.createTempSync('sprint35_');
      adapter = _RecordingAdapter();
      apiService.dio.httpClientAdapter = adapter;
    });
    tearDown(() => dir.deleteSync(recursive: true));

    String write(String name, List<int> bytes) {
      final f = File('${dir.path}/$name')..writeAsBytesSync(bytes);
      return f.path;
    }

    void expectPart(String body, {required String field, required String filename, required String type}) {
      final head = body.toLowerCase();
      expect(head, contains('name="$field"; filename="${filename.toLowerCase()}"'));
      expect(head, contains('content-type: $type'));
    }

    test('prescription photo: JPEG bytes from a .HEIC name', () async {
      await apiService.uploadPrescription(filePath: write('IMG_1.HEIC', _jpeg), filename: 'IMG_1.HEIC');
      expect(adapter.requests.single.path, '/prescriptions/upload');
      expectPart(adapter.requests.single.body, field: 'prescription', filename: 'IMG_1.jpg', type: 'image/jpeg');
    });

    test('prescription PDF', () async {
      await apiService.uploadPrescription(filePath: write('rx.pdf', _pdf), filename: 'rx.pdf');
      expectPart(adapter.requests.single.body, field: 'prescription', filename: 'rx.pdf', type: 'application/pdf');
    });

    test('licence copy: PNG bytes named .jpg go as image/png', () async {
      await apiService.uploadLicenceCopy('L1', filePath: write('dl.jpg', _png), filename: 'dl.jpg');
      expectPart(adapter.requests.single.body, field: 'file', filename: 'dl.png', type: 'image/png');
    });

    test('KYC document', () async {
      await apiService.uploadKycDocument(
          documentType: 'pan_card', filePath: write('pan.jpeg', _jpeg), filename: 'pan.jpeg', accessToken: 't');
      expectPart(adapter.requests.single.body, field: 'file', filename: 'pan.jpeg', type: 'image/jpeg');
    });

    test('a HEIC photo is refused before anything is sent', () async {
      await expectLater(
        apiService.uploadPrescription(filePath: write('IMG_2.jpg', _heic), filename: 'IMG_2.jpg'),
        throwsA(isA<UploadRefused>()),
      );
      await expectLater(
        apiService.uploadKycDocument(documentType: 'pan_card', filePath: write('pan.jpg', _heic), filename: 'pan.jpg'),
        throwsA(isA<UploadRefused>()),
      );
      expect(adapter.requests, isEmpty);
    });

    test('a missing file is refused in plain words', () async {
      await expectLater(prepareUpload('${dir.path}/gone.jpg', 'gone.jpg'),
          throwsA(isA<UploadRefused>().having((e) => e.message, 'message', 'Could not read gone.jpg')));
    });
  });
}
