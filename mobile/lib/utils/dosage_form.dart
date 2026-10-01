/// Dosage form guessed from a product name, used only to label the product
/// placeholder image ("Tablet", "Syrup" …). It is a display hint, never a
/// declaration: the server's product data stays the record.
enum DosageForm {
  tablet('Tablet'),
  capsule('Capsule'),
  syrup('Syrup'),
  injection('Injection'),
  cream('Cream'),
  drops('Drops');

  final String label;
  const DosageForm(this.label);
}

// Checked in this order: the first form whose word appears in the name wins.
// Words are matched whole (so "Tablets" matches but "Capsulex" does not).
const List<(DosageForm, List<String>)> _keywords = [
  (DosageForm.injection, ['injection', 'injections', 'inj', 'vial', 'vials', 'ampoule', 'ampoules', 'amp']),
  (DosageForm.drops, ['drop', 'drops', 'eye drops', 'ear drops', 'nasal drops']),
  (DosageForm.syrup, ['syrup', 'syrups', 'syp', 'suspension', 'susp', 'oral solution', 'elixir', 'liquid', 'linctus']),
  (DosageForm.cream, ['cream', 'creams', 'ointment', 'oint', 'gel', 'lotion']),
  (DosageForm.capsule, ['capsule', 'capsules', 'cap', 'caps', 'softgel', 'softgels']),
  (DosageForm.tablet, ['tablet', 'tablets', 'tab', 'tabs']),
];

/// The dosage form named in [productName], or null when none is recognised.
DosageForm? inferDosageForm(String? productName) {
  final name = (productName ?? '').toLowerCase();
  if (name.trim().isEmpty) return null;
  final words = ' ${name.replaceAll(RegExp(r'[^a-z0-9]+'), ' ')} ';
  for (final (form, keys) in _keywords) {
    for (final k in keys) {
      if (words.contains(' $k ')) return form;
    }
  }
  return null;
}
