/// Indian mobile number check for the sign-in pages (same words as before;
/// the server checks again with the same rule: ^[6-9]\d{9}$).
String? mobileProblem(String? v) {
  final t = v?.trim() ?? '';
  if (t.isEmpty) return 'Mobile number required';
  if (!RegExp(r'^[6-9]\d{9}$').hasMatch(t)) return 'Enter valid 10-digit number';
  return null;
}
