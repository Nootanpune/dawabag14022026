// Editor model for the sms.dlt_templates setting (Sprint 8). Indian operators
// deliver only DLT-registered SMS templates (TRAI), so each message type maps
// to its MSG91 template id and to which of our values fill its variables:
//   { "<message type>": { "template_id": "...", "vars": { "<MSG91 var>": "<our var>" } } }
// The server validates the object strictly (PUT /admin/settings/sms.dlt_templates).

export interface DltTemplate {
  template_id: string;
  vars?: Record<string, string>;
}

export type DltTemplates = Record<string, DltTemplate>;

/** Message types the server sends by SMS */
export const DLT_MESSAGE_TYPES = [
  'otp',
  'payment_confirmed',
  'rx_pending',
  'rx_verified',
  'rx_rejected',
  'packed',
  'dispatched',
  'delivered',
  'out_for_delivery',
  'order_status',
  'order_cancelled',
  'refill_reminder',
  'refill_upcoming',
  'refill_order_created',
  'refill_failed',
  'return_update',
  'grievance_update',
  'credit_due',
  'kyc_approved',
  'kyc_rejected',
  'batch_recall',
] as const;

/** Values the server can put into a template (smsVariables on the server) */
export const DLT_VARIABLES = [
  'order_number',
  'status',
  'awb',
  'courier',
  'tracking_url',
  'reason',
  'amount',
  'date',
  'code',
  'otp',
  'ticket',
  'return_no',
  'product',
  'batch',
  'report_no',
] as const;

export const labelOf = (key: string) => key.replace(/_/g, ' ');

export interface DltVarRow {
  name: string; // MSG91 variable name
  ours: string; // one of DLT_VARIABLES
}

export interface DltRow {
  type: string;
  template_id: string;
  vars: DltVarRow[];
}

/** Server value → editable rows. Tolerates a missing or malformed value. */
export function toDltRows(value: unknown): DltRow[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([type, t]) => {
    const tpl = (t ?? {}) as Partial<DltTemplate>;
    const vars = tpl.vars && typeof tpl.vars === 'object' && !Array.isArray(tpl.vars) ? tpl.vars : {};
    return {
      type,
      template_id: typeof tpl.template_id === 'string' ? tpl.template_id : '',
      vars: Object.entries(vars).map(([name, ours]) => ({ name, ours: String(ours) })),
    };
  });
}

/** Rows → the value to PUT, or the first problem found. Mirrors the server schema. */
export function fromDltRows(rows: DltRow[]): { value: DltTemplates } | { error: string } {
  const out: DltTemplates = {};
  for (const r of rows) {
    if (!r.type) return { error: 'Choose a message type for every row' };
    if (out[r.type]) return { error: `${labelOf(r.type)} appears twice` };
    const id = r.template_id.trim();
    if (!id) return { error: `Enter the DLT template id for ${labelOf(r.type)}` };
    if (id.length > 60) return { error: `Template id for ${labelOf(r.type)} is too long (max 60)` };
    const vars: Record<string, string> = {};
    for (const v of r.vars) {
      const name = v.name.trim();
      if (!/^[A-Za-z0-9_]{1,30}$/.test(name)) return { error: `${labelOf(r.type)}: MSG91 variable names use letters, digits and _ (max 30)` };
      if (vars[name]) return { error: `${labelOf(r.type)}: variable ${name} is mapped twice` };
      if (!v.ours) return { error: `${labelOf(r.type)}: choose our value for ${name}` };
      vars[name] = v.ours;
    }
    out[r.type] = Object.keys(vars).length ? { template_id: id, vars } : { template_id: id };
  }
  return { value: out };
}
