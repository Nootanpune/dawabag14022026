// A renewed or extra drug licence typed in the app (Sprint 32), sent to
// POST /users/me/licences like the web's "Your drug licences" page. Mirrors
// frontend-web/src/lib/licences/forms.ts; the server (services/licences/forms.ts,
// input.ts) repeats every rule and is the authority. Held in memory only.
// C-07 licence numbers and validity, C-11 buyer KYC, C-14 a lapsed licence pauses trade orders.

/// A licence form as printed on the licence.
class LicenceFormInfo {
  final String code; // dl20 … or 'other'
  final String label;
  final String hint;
  const LicenceFormInfo(this.code, this.label, this.hint);
}

const List<LicenceFormInfo> kLicenceForms = [
  LicenceFormInfo('dl20', 'Form 20', 'Retail sale'),
  LicenceFormInfo('dl21', 'Form 21', 'Retail — Schedule C / C1 medicines'),
  LicenceFormInfo('dl20a', 'Form 20A', 'Restricted retail licence'),
  LicenceFormInfo('dl21a', 'Form 21A', 'Restricted retail — Schedule C / C1'),
  LicenceFormInfo('dl20b', 'Form 20B', 'Wholesale'),
  LicenceFormInfo('dl21b', 'Form 21B', 'Wholesale — Schedule C / C1 medicines'),
  LicenceFormInfo('dl25', 'Form 25', 'Manufacture for sale'),
  LicenceFormInfo('dl28', 'Form 28', 'Manufacture — Schedule C / C1'),
  LicenceFormInfo('dl25a', 'Form 25A', 'Loan licence to manufacture'),
  LicenceFormInfo('dl28a', 'Form 28A', 'Loan licence — Schedule C / C1'),
  LicenceFormInfo('dl25b', 'Form 25B', 'Repacking licence'),
  LicenceFormInfo('dl20c', 'Form 20C', 'Homoeopathic — retail'),
  LicenceFormInfo('dl20d', 'Form 20D', 'Homoeopathic — wholesale'),
  LicenceFormInfo('dl20f', 'Form 20F', 'Schedule X — retail (never sold online)'),
  LicenceFormInfo('dl20g', 'Form 20G', 'Schedule X — wholesale (never sold online)'),
  LicenceFormInfo('other', 'Other licence', 'Type the name of the form'),
];

/// Forms offered first for each account type (as the web's /account/licences).
const Map<String, List<String>> kSuggestedLicenceForms = {
  'b2b_retailer': ['dl20', 'dl21'],
  'b2b_wholesaler': ['dl20b', 'dl21b'],
  'doc_hospital': ['dl20', 'dl21'],
};

/// [kLicenceForms] with the account's usual forms first.
List<LicenceFormInfo> licenceFormsFor(String? customerType) {
  final first = kSuggestedLicenceForms[customerType] ?? const <String>[];
  return [
    for (final c in first) kLicenceForms.firstWhere((f) => f.code == c),
    for (final f in kLicenceForms)
      if (!first.contains(f.code)) f,
  ];
}

String licenceFormLabel(String code, [String? formName]) {
  if (code == 'other') return (formName ?? '').trim().isEmpty ? 'Other licence' : formName!.trim();
  for (final f in kLicenceForms) {
    if (f.code == code) return f.label;
  }
  return code;
}

class LicenceDraft {
  final String form; // '' = not chosen
  final String formName;
  final String number;
  final String issuedBy;
  final String validUpto; // YYYY-MM-DD or ''

  const LicenceDraft({
    this.form = '',
    this.formName = '',
    this.number = '',
    this.issuedBy = '',
    this.validUpto = '',
  });

  /// One licence in the POST /users/me/licences body.
  Map<String, dynamic> toBody() => {
        'form': form.isEmpty ? 'other' : form,
        'form_name': form == 'other' && formName.trim().isNotEmpty ? formName.trim() : null,
        'licence_number': number.trim(),
        'issued_by': issuedBy.trim().isEmpty ? null : issuedBy.trim(),
        'valid_from': null,
        'valid_upto': validUpto.isEmpty ? null : validUpto,
      };
}

/// Early, plain checks before sending (the server's words); empty = can send.
/// [today] is the India date as YYYY-MM-DD.
List<String> licenceDraftProblems(LicenceDraft d, String today) {
  if (d.form.isEmpty && d.number.trim().isEmpty) return const ['Enter the licence'];
  if (d.form.isEmpty) return const ['Choose the licence form'];
  final p = <String>[];
  final label = licenceFormLabel(d.form, d.formName);
  if (d.form == 'other' && d.formName.trim().length < 2) p.add('Type the name of the licence form');
  if (d.number.replaceAll(RegExp(r'[^A-Za-z0-9]'), '').length < 3) p.add('$label: enter the licence number');
  if (d.validUpto.isEmpty) {
    p.add('$label: enter the valid-till date');
  } else if (d.validUpto.compareTo(today) < 0) {
    p.add('$label expired on ${d.validUpto} — enter the renewed licence');
  }
  return p;
}

/// What the server accepts for a licence copy (register.service): PDF, JPG or PNG up to 5 MB.
const kLicenceFileMaxBytes = 5 * 1024 * 1024;
