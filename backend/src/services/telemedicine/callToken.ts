// Agora RTC tokens for teleconsultation calls: one channel, one account, a short
// life. Without AGORA_APP_CERTIFICATE (development) no token is issued and the
// app cannot join — production refuses to start without it when Agora is set up.
import { RtcRole, RtcTokenBuilder } from 'agora-token';

export function rtcToken(channel: string, account: string, validForSeconds: number): string | null {
  const appId = process.env.AGORA_APP_ID, cert = process.env.AGORA_APP_CERTIFICATE;
  if (!appId || !cert) return null;
  return RtcTokenBuilder.buildTokenWithUserAccount(appId, cert, channel, account, RtcRole.PUBLISHER, validForSeconds, validForSeconds);
}
