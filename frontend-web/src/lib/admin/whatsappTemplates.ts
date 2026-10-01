// Editor model for the whatsapp.templates setting (Sprint 13). Only templates
// approved by Meta can start a WhatsApp conversation, so each message type maps
// to its approved template; body variables {{1}}, {{2}}… are filled in order
// from `vars`. Sent only to buyers who opted in (C-42).
//   { "<message type>": { "name": "order_dispatched", "language": "en", "vars": ["order_number", "awb"] } }
// The server validates the object strictly (PUT /admin/settings/whatsapp.templates).
import { DLT_MESSAGE_TYPES, DLT_VARIABLES, labelOf } from './dltTemplates';

export const WHATSAPP_TEMPLATES_KEY = 'whatsapp.templates';

/** Same message types and values as SMS: the server fills both from smsVariables() */
export const WA_MESSAGE_TYPES = DLT_MESSAGE_TYPES;
export const WA_VARIABLES = DLT_VARIABLES;
export const WA_MAX_VARS = 10;

export interface WaTemplate {
  name: string;
  language: string;
  vars?: string[];
}

export type WaTemplates = Record<string, WaTemplate>;

export interface WaRow {
  type: string;
  name: string;
  language: string;
  vars: string[];
}

// Mirrors SETTING_SCHEMAS['whatsapp.templates'] on the server
const TYPE_RE = /^[a-z_]{2,40}$/;
const NAME_RE = /^[a-z0-9_]{1,512}$/;
const LANGUAGE_RE = /^[a-z]{2}(_[A-Z]{2})?$/;
const VAR_RE = /^[a-z_]{2,30}$/;

/** Server value → editable rows. Tolerates a missing or malformed value. */
export function toWaRows(value: unknown): WaRow[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([type, t]) => {
    const tpl = (t ?? {}) as Partial<WaTemplate>;
    return {
      type,
      name: typeof tpl.name === 'string' ? tpl.name : '',
      language: typeof tpl.language === 'string' ? tpl.language : 'en',
      vars: Array.isArray(tpl.vars) ? tpl.vars.map(String) : [],
    };
  });
}

/** Rows → the value to PUT, or the first problem found. */
export function fromWaRows(rows: WaRow[]): { value: WaTemplates } | { error: string } {
  const out: WaTemplates = {};
  for (const r of rows) {
    if (!r.type) return { error: 'Choose a message type for every row' };
    if (!TYPE_RE.test(r.type)) return { error: `${r.type}: message types use lowercase letters and _` };
    if (out[r.type]) return { error: `${labelOf(r.type)} appears twice` };
    const name = r.name.trim();
    if (!NAME_RE.test(name)) return { error: `${labelOf(r.type)}: the template name uses lowercase letters, digits and _ only (as approved by Meta)` };
    const language = r.language.trim();
    if (!LANGUAGE_RE.test(language)) return { error: `${labelOf(r.type)}: language is a code like en, hi, mr or en_US` };
    if (r.vars.length > WA_MAX_VARS) return { error: `${labelOf(r.type)}: at most ${WA_MAX_VARS} variables` };
    if (r.vars.some((v) => !v)) return { error: `${labelOf(r.type)}: choose a value for every variable` };
    if (r.vars.some((v) => !VAR_RE.test(v))) return { error: `${labelOf(r.type)}: unknown variable` };
    out[r.type] = r.vars.length ? { name, language, vars: r.vars } : { name, language };
  }
  return { value: out };
}
