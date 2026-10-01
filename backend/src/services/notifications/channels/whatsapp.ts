// WhatsApp through MSG91's WhatsApp API. Only templates approved by Meta can start
// a conversation, so each message type maps to its template (setting
// whatsapp.templates) and the template's body variables are filled in order from
// smsVariables(). Sent only to buyers whose latest WhatsApp consent is "yes".
import { queryOne } from '../../../config/database';
import { getSetting } from '../../settings.service';
import { ChannelResult } from './result';

interface WaTemplate { name: string; language: string; vars?: string[] }

export async function whatsappOptedIn(userId: string): Promise<boolean> {
  const c = await queryOne<{ granted: boolean }>(
    `SELECT granted FROM consent_records WHERE user_id = $1 AND purpose = 'whatsapp' ORDER BY recorded_at DESC LIMIT 1`, [userId]);
  return c?.granted === true;
}

export async function sendWhatsApp(mobile: string, type: string, values: Record<string, string>): Promise<ChannelResult | null> {
  const templates = await getSetting<Record<string, WaTemplate>>('whatsapp.templates', {});
  const t = templates[type];
  if (!t) return null;                                         // this message type is not sent on WhatsApp
  if (!process.env.MSG91_AUTH_KEY || !process.env.MSG91_WHATSAPP_NUMBER) return { status: 'skipped', detail: 'WhatsApp not configured' };
  const components: Record<string, { type: 'text'; value: string }> = {};
  for (const [i, ours] of (t.vars ?? []).entries()) {
    if (values[ours] == null) return { status: 'skipped', detail: `WhatsApp template for "${type}" needs ${ours}, which this message does not have` };
    components[`body_${i + 1}`] = { type: 'text', value: values[ours] };
  }
  try {
    const res = await fetch(`${process.env.MSG91_BASE_URL || 'https://control.msg91.com'}/api/v5/whatsapp/whatsapp-outbound-message/bulk/`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', authkey: process.env.MSG91_AUTH_KEY },
      body: JSON.stringify({
        integrated_number: process.env.MSG91_WHATSAPP_NUMBER, content_type: 'template',
        payload: { messaging_product: 'whatsapp', type: 'template', template: {
          name: t.name, language: { code: t.language, policy: 'deterministic' },
          to_and_components: [{ to: [`91${mobile}`], components }] } },
      }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok || body.status === 'fail' || body.type === 'error') return { status: 'failed', detail: String(body.message || body.errors || res.statusText).slice(0, 500) };
    return { status: 'sent', ref: String(body.request_id ?? body.message ?? '') };
  } catch (e: any) {
    return { status: 'failed', detail: String(e?.message || e).slice(0, 500) };
  }
}
