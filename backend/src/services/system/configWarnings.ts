// Configuration warnings for the admin dashboard (Sprint 40): integrations missing on this
// server that change what people see — today the SMS provider (MSG91) behind sign-in codes
// and "Forgot password". The API's start-up checks (config/env.ts) log the same; this makes
// them visible to admins in production too, without reading server logs.
import { otpTemplateMissing, smsConfigured } from '../notifications/channels/sms';

export interface ConfigWarning { code: string; message: string }

export async function configWarnings(): Promise<ConfigWarning[]> {
  const out: ConfigWarning[] = [];
  if (!smsConfigured()) {
    out.push({ code: 'SMS_NOT_CONFIGURED', message: 'SMS (MSG91) is not configured: sign-in codes and "Forgot password" codes cannot be sent. '
      + 'People must sign in with their password; an admin resets passwords. Set MSG91_AUTH_KEY and MSG91_TEMPLATE_OTP (RUNBOOK).' });
  } else if (await otpTemplateMissing()) {
    out.push({ code: 'SMS_OTP_TEMPLATE_MISSING', message: 'SMS is configured but no DLT template is registered for the sign-in code (MSG91_TEMPLATE_OTP or '
      + 'Settings → sms.dlt_templates "otp"): codes are not delivered.' });
  }
  return out;
}
