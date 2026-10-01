// Small JSON coercion helpers shared by the Sprint 4 models. The API is the
// only authority; models are rebuilt from every response.

int asInt(Object? v, [int fallback = 0]) {
  if (v is int) return v;
  if (v is num) return v.round();
  if (v is String) return int.tryParse(v) ?? num.tryParse(v)?.round() ?? fallback;
  return fallback;
}

String? asString(Object? v) => v?.toString();

bool asBool(Object? v) => v == true || v == 'true';

Map<String, dynamic> asMap(Object? v) =>
    v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

List<Map<String, dynamic>> asMapList(Object? v) => v is List
    ? v.whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList()
    : const [];
