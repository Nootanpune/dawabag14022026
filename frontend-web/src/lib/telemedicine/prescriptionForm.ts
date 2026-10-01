// E-prescription form rows → API body (1–20 medicines, each once, 1–365 days).
// The server is the authority: it refuses medicines the guidelines do not allow (C-23).
import type { MedicineHit, PrescriptionInput } from './types';

export interface MedicineRowValues {
  key: number;
  product: MedicineHit | null;
  dosage: string;
  frequency: string;
  duration_days: string;
  instructions: string;
}

let nextKey = 1;
export function emptyRow(): MedicineRowValues {
  return { key: nextKey++, product: null, dosage: '', frequency: '', duration_days: '5', instructions: '' };
}

export const MAX_ITEMS = 20;

export function buildPrescriptionBody(
  diagnosis: string,
  advice: string,
  newCondition: boolean,
  rows: MedicineRowValues[]
): { body?: PrescriptionInput; problems: string[] } {
  const problems: string[] = [];
  if (diagnosis.trim().length < 3) problems.push('Diagnosis: at least 3 characters');
  if (!rows.length) problems.push('Add at least one medicine');
  if (rows.length > MAX_ITEMS) problems.push(`At most ${MAX_ITEMS} medicines`);
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const n = `Medicine ${i + 1}`;
    if (!r.product) return problems.push(`${n}: choose a product`);
    if (seen.has(r.product.id)) problems.push(`${n}: ${r.product.name} is already on the prescription`);
    seen.add(r.product.id);
    if (!r.dosage.trim()) problems.push(`${n}: dose is required`);
    if (!r.frequency.trim()) problems.push(`${n}: how often is required`);
    const d = Number(r.duration_days);
    if (!Number.isInteger(d) || d < 1 || d > 365) problems.push(`${n}: days must be 1 to 365`);
  });
  if (problems.length) return { problems };
  return {
    problems,
    body: {
      diagnosis: diagnosis.trim(),
      advice: advice.trim() || undefined,
      new_condition: newCondition || undefined,
      items: rows.map((r) => ({
        product_id: r.product!.id,
        dosage: r.dosage.trim(),
        frequency: r.frequency.trim(),
        duration_days: Number(r.duration_days),
        instructions: r.instructions.trim() || undefined,
      })),
    },
  };
}
