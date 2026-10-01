// GST state / union territory codes (the first two digits of a GSTIN), used for
// the place of supply on e-invoices (C-31).
const CODES: Record<string, string> = {
  jammuandkashmir: '01', himachalpradesh: '02', punjab: '03', chandigarh: '04', uttarakhand: '05', haryana: '06',
  delhi: '07', rajasthan: '08', uttarpradesh: '09', bihar: '10', sikkim: '11', arunachalpradesh: '12', nagaland: '13',
  manipur: '14', mizoram: '15', tripura: '16', meghalaya: '17', assam: '18', westbengal: '19', jharkhand: '20',
  odisha: '21', orissa: '21', chhattisgarh: '22', madhyapradesh: '23', gujarat: '24',
  dadraandnagarhavelianddamananddiu: '26', dadranagarhaveli: '26', damananddiu: '26', maharashtra: '27',
  karnataka: '29', goa: '30', lakshadweep: '31', kerala: '32', tamilnadu: '33', puducherry: '34', pondicherry: '34',
  andamanandnicobarislands: '35', telangana: '36', andhrapradesh: '37', ladakh: '38',
};
const ALIASES: Record<string, string> = { mh: 'maharashtra', ka: 'karnataka', gj: 'gujarat', dl: 'delhi', tn: 'tamilnadu', nct: 'delhi', nctofdelhi: 'delhi' };

export function stateCode(state: string | null | undefined): string | null {
  if (!state) return null;
  const n = state.trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
  return CODES[ALIASES[n] ?? n] ?? null;
}

export const gstinStateCode = (gstin: string | null | undefined): string | null =>
  gstin && /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : null;
