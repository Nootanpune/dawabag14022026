import 'api_utils.dart';

/// The `code` POST /auth/send-otp answers (503) when no text-message provider
/// is switched on (Sprint 40). The answer is the same for every mobile, so it
/// says nothing about which numbers have accounts (C-41 / C-44).
const kSmsNotConfiguredCode = 'SMS_NOT_CONFIGURED';

/// Used only if the server's answer carries no sentence of its own.
const kSmsNotConfiguredFallback =
    'Text-message codes are not switched on yet. Please sign in with your password, or ask the admin to reset it.';

/// Whether [error] is the server saying codes cannot be sent by text message.
/// Sign-in by code and "Forgot password" then go back to the password path
/// instead of asking for a code that will never arrive.
bool isSmsNotConfigured(Object error) => apiErrorCode(error) == kSmsNotConfiguredCode;

/// The server's own sentence for [error] when it is [isSmsNotConfigured].
String smsNotConfiguredMessage(Object error) => apiErrorMessage(error, fallback: kSmsNotConfiguredFallback);
