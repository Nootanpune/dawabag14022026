// Telemedicine Practice Guidelines 2020 — which medicines a teleconsultation may
// prescribe (C-23). Pure: no I/O.
//   List O  — over-the-counter and common medicines: any consultation, any mode
//   List A  — first consultation by video only; re-fills in a follow-up
//   List B  — add-ons, only in a follow-up for the same condition
//   Prohibited — Schedule X and NDPS: never by teleconsultation
// A medicine not yet classified cannot be prescribed until a pharmacist classifies it.
export type ConsultMode = 'video' | 'audio' | 'text';
export type ConsultKind = 'first' | 'follow_up';
export type TeleList = 'O' | 'A' | 'B' | 'prohibited';

export function allowedLists(kind: ConsultKind, mode: ConsultMode): TeleList[] {
  if (kind === 'follow_up') return ['O', 'A', 'B'];
  return mode === 'video' ? ['O', 'A'] : ['O'];
}

const WHY: Record<string, string> = {
  A: 'List A medicines need a video consultation the first time',
  B: 'List B medicines can only be added in a follow-up for the same condition',
};

// Returns the reason a medicine cannot be prescribed in this consultation, or null
export function refusal(p: { name: string; drug_schedule: string | null; telemedicine_list: TeleList | null },
                        kind: ConsultKind, mode: ConsultMode): string | null {
  if (p.telemedicine_list === 'prohibited' || ['Schedule X', 'NDPS'].includes(p.drug_schedule ?? '')) {
    return `${p.name} can never be prescribed by teleconsultation (Schedule X / NDPS)`;
  }
  if (!p.telemedicine_list) return `${p.name} has no telemedicine list yet; ask the pharmacist to classify it`;
  if (allowedLists(kind, mode).includes(p.telemedicine_list)) return null;
  return `${p.name} (List ${p.telemedicine_list}): ${WHY[p.telemedicine_list] ?? 'not allowed in this consultation'}`;
}

// Same doctor, within the follow-up window, and the doctor has not marked a new condition
export function consultKind(lastWithDoctor: Date | null, followUpDays: number, newCondition: boolean, now = new Date()): ConsultKind {
  if (newCondition || !lastWithDoctor) return 'first';
  return (now.getTime() - lastWithDoctor.getTime()) / 864e5 <= followUpDays ? 'follow_up' : 'first';
}
