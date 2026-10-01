import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/api_service.dart';
import 'address_provider.dart';

/// Product search, keyed by a query string (q, category, pincode): Map keys
/// would compare by identity and create a new request on every build.
/// Always fetched from the server; nothing is cached on the device.
final productsProvider = FutureProvider.family<Map<String, dynamic>, String>(
  (ref, query) async {
    final params = Uri.splitQueryString(query);
    final queryParams = {
      if (params['q']?.isNotEmpty == true) 'q': params['q']!,
      if (params['category']?.isNotEmpty == true) 'category': params['category']!,
      if (params['pincode']?.isNotEmpty == true) 'pincode': params['pincode']!,
      'limit': '20',
    };
    final res = await apiService.dio.get('/products/search', queryParameters: queryParams);
    return res.data['data'] as Map<String, dynamic>;
  },
);

/// GET /products/categories → [{category, product_count}].
final categoriesProvider = FutureProvider<List<dynamic>>((_) async {
  final res = await apiService.dio.get('/products/categories');
  return res.data['data'] as List<dynamic>;
});

/// Pincode typed on the home screen for this app session, memory only.
final typedPincodeProvider = StateProvider<String>((_) => '');

/// The pincode used for search: the typed one, else the default address's
/// pincode (server data), else empty.
final browsePincodeProvider = Provider<String>((ref) {
  final typed = ref.watch(typedPincodeProvider);
  if (typed.isNotEmpty) return typed;
  return ref.watch(defaultPincodeProvider) ?? '';
});

/// Builds the [productsProvider] key.
String productsQueryKey({String q = '', String category = '', String pincode = ''}) =>
    Uri(queryParameters: {'q': q, 'category': category, 'pincode': pincode}).query;
