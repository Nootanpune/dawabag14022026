import '../models/address.dart';
import 'api_service.dart';

/// Saved addresses, /users/me/addresses. The server validates every field
/// (mobile 6–9 + 9 digits, 6-digit pincode) and keeps the only copy.
extension AddressApi on ApiService {
  /// POST /users/me/addresses
  Future<void> createAddress(AddressInput input) async {
    await dio.post('/users/me/addresses', data: input.toJson());
  }

  /// PUT /users/me/addresses/:id
  Future<void> updateAddress(String id, AddressInput input) async {
    await dio.put('/users/me/addresses/$id', data: input.toJson());
  }

  /// DELETE /users/me/addresses/:id (the server keeps addresses used by
  /// orders for the record and hides them from the list)
  Future<void> deleteAddress(String id) async {
    await dio.delete('/users/me/addresses/$id');
  }

  /// POST /users/me/addresses/:id/default
  Future<void> setDefaultAddress(String id) async {
    await dio.post('/users/me/addresses/$id/default');
  }
}
