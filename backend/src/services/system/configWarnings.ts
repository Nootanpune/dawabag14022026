// Configuration warnings for the admin dashboard (Sprint 40): integrations missing on this
// server that change what people see — today the SMS provider (MSG91) behind sign-in codes
// and "Forgot password". The API's start-up checks (config/env.ts) log the same; this makes
// them visible to admins in production too, without reading server logs.
import { otpTemplateMissing, smsConfigured } from '../notifications/channels/sms';
import { getDB } from '../../config/database';
import { loginPosture } from '../../db/appLogin';
import { getSetting } from '../settings.service';
import { approvedCouriers, COLD_CHAIN_COURIERS_KEY } from '../delivery/coldChainCourier';

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
  // Sprint 41: cold-chain parcels may leave with any courier until the approved list is set (URS-105, C-25)
  const couriers = await (async () => approvedCouriers(await getSetting<unknown>(COLD_CHAIN_COURIERS_KEY, null)))().catch(() => null);
  if (couriers && !couriers.length) {
    out.push({ code: 'COLD_CHAIN_COURIERS_NOT_SET', message: 'No approved cold-chain courier list is set: refrigerated parcels may be dispatched with any courier. '
      + 'Add the approved names in Settings → "Approved cold-chain couriers".' });
  }
  // Sprint 41: the API must not run as the database owner (it could switch the record triggers off)
  const p = await (async () => loginPosture(getDB()))().catch(() => null);
  if (p && !p.restricted) {
    out.push({ code: 'DB_LOGIN_NOT_RESTRICTED', message: `The API connects to the database as "${p.user}", which `
      + `${p.superuser ? 'is a superuser' : p.owns_tables ? 'owns the tables' : p.maintenance_member ? 'may act as dawabag_maintenance' : 'is not in dawabag_app'}: `
      + 'it could switch off the protections of the statutory records. Run it as its own login in dawabag_app only (RUNBOOK §6).' });
  }
  return out;
}
