import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/utils/dosage_form.dart';

void main() {
  group('inferDosageForm', () {
    final cases = <String, DosageForm?>{
      'Dolo 650 Tablet': DosageForm.tablet,
      'Crocin Advance Tablets 15s': DosageForm.tablet,
      'Pan 40 Tab': DosageForm.tablet,
      'Becosules Capsule': DosageForm.capsule,
      'Omez 20 Caps': DosageForm.capsule,
      'Benadryl Cough Syrup 100ml': DosageForm.syrup,
      'Calpol Suspension': DosageForm.syrup,
      'Insulin Glargine Injection': DosageForm.injection,
      'Ceftriaxone 1g Inj': DosageForm.injection,
      'Betnovate-N Cream': DosageForm.cream,
      'Volini Gel 30g': DosageForm.cream,
      'Moxiflox Eye Drops': DosageForm.drops,
      'Otrivin Nasal Drop': DosageForm.drops,
      'Paracetamol': null,
      'Dettol Antiseptic': null,
      '': null,
    };
    cases.forEach((name, expected) {
      test('"$name" -> ${expected?.label}', () => expect(inferDosageForm(name), expected));
    });

    test('null name', () => expect(inferDosageForm(null), isNull));

    test('matches whole words only', () {
      expect(inferDosageForm('Tabcin Plus'), isNull);
      expect(inferDosageForm('Capsulex'), isNull);
    });

    test('case and punctuation do not matter', () {
      expect(inferDosageForm('AZITHRAL-500 TABLET'), DosageForm.tablet);
      expect(inferDosageForm('Zincovit (Syrup)'), DosageForm.syrup);
    });
  });

  test('labels', () {
    expect(DosageForm.values.map((f) => f.label),
        ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Drops']);
  });
}
