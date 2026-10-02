import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/api_service.dart';

/// Suggestions start after this many characters (same as the web, Sprint 26).
const kTypeaheadMinChars = 2;

/// How many medicines the home search dropdown shows.
const kTypeaheadLimit = 6;

/// Wait after the last key press before asking the server.
const kTypeaheadDebounce = Duration(milliseconds: 250);

/// The top matches for the home search box.
class TypeaheadResult {
  final List<Map<String, dynamic>> products;
  final int total;
  const TypeaheadResult({this.products = const [], this.total = 0});

  factory TypeaheadResult.fromApi(Map<String, dynamic> data) {
    final list = ((data['products'] as List?) ?? const []).whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList();
    final total = ((data['pagination'] as Map?)?['total'] as num?)?.toInt() ?? list.length;
    return TypeaheadResult(products: list, total: total);
  }
}

/// Key for [typeaheadProvider]: the query and the buyer's pincode, as a string
/// (a Map key would compare by identity and refetch on every build).
String typeaheadKey(String q, {String pincode = ''}) =>
    Uri(queryParameters: {'q': q.trim(), if (pincode.isNotEmpty) 'pincode': pincode}).query;

/// GET /products/search?q=&limit=6 — the same search the web's home box uses.
/// The server decides matches, order, the buyer's own price and stock, and never
/// returns Schedule X / NDPS (C-10). Held in memory while the dropdown shows it.
final typeaheadProvider = FutureProvider.autoDispose.family<TypeaheadResult, String>((ref, key) async {
  final params = Uri.splitQueryString(key);
  final q = params['q'] ?? '';
  if (q.length < kTypeaheadMinChars) return const TypeaheadResult();
  final res = await apiService.dio.get('/products/search', queryParameters: {
    'q': q,
    if ((params['pincode'] ?? '').isNotEmpty) 'pincode': params['pincode'],
    'page': '1',
    'limit': '$kTypeaheadLimit',
  });
  final data = res.data is Map ? (res.data as Map)['data'] : null;
  return data is Map ? TypeaheadResult.fromApi(Map<String, dynamic>.from(data)) : const TypeaheadResult();
});
