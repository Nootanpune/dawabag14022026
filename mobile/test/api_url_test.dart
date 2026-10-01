import 'package:dawabag/config/api_url.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('debug builds may use the emulator host over http', () {
    expect(apiBaseUrl(url: 'http://10.0.2.2:4000', release: false), 'http://10.0.2.2:4000');
  });
  test('release builds accept only an https API address (C-41)', () {
    expect(apiBaseUrl(url: 'https://api.dawabag.in', release: true), 'https://api.dawabag.in');
    expect(() => apiBaseUrl(url: 'http://10.0.2.2:4000', release: true), throwsStateError);
    expect(() => apiBaseUrl(url: 'api.dawabag.in', release: true), throwsStateError);
  });
}
