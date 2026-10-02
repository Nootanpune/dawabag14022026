// Forced password change (Sprint 32). A login created by Dawabag's admin with a
// temporary password (users.must_change_password, Sprint 28) can use nothing but
// the change-password screen until it chooses its own. The server enforces the
// same rule on every call (403 PASSWORD_CHANGE_REQUIRED); this only takes the
// person straight to the form, then on to where they were going.

const kChangePasswordPath = '/account/change-password';

/// Location of the change-password screen; [required] hides Back, [next] is
/// where to continue afterwards.
String changePasswordLocation({bool required = false, String? next}) => Uri(
      path: kChangePasswordPath,
      queryParameters: {
        if (required) 'required': '1',
        if (next != null && next.isNotEmpty && next != '/') 'next': next,
      },
    ).toString().replaceAll(RegExp(r'\?$'), '');

/// Router redirect: null when [location] may open, else the change-password screen.
String? passwordGateRedirect(Uri location, {required bool loggedIn, required bool mustChange}) {
  if (!loggedIn || !mustChange || location.path == kChangePasswordPath) return null;
  final going = location.path.startsWith('/auth') ? null : location.toString();
  return changePasswordLocation(required: true, next: going);
}

/// Where to go after the change: a safe in-app path only (never another site).
String continueAfterPasswordChange(String? next) {
  if (next == null || !next.startsWith('/') || next.startsWith('//') || next.startsWith(kChangePasswordPath)) {
    return '/';
  }
  return next;
}
