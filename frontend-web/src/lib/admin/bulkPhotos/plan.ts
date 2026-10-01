// Bulk pack photos: turn the chosen files into an upload plan (which SKU each
// maps to, which ones are not sent and why) and split it into batches the API
// accepts. Files live only in React state for this page view; nothing is stored
// in the browser (standing rule).
import { PRODUCT_PHOTO_MAX_BYTES } from '../products';
import { skuFromFilename, skuKey } from './skuFromFilename';

/** API limits: POST /products/images/bulk takes ≤ 50 files and ≤ 60 MB per request */
export const BULK_MAX_FILES = 50;
export const BULK_MAX_BYTES = 40 * 1024 * 1024;

export interface PlannedPhoto {
  id: string;
  file: File;
  name: string;
  sku: string | null;
  /** why this file will not be sent; null = it will be uploaded */
  problem: string | null;
  problemStatus?: 'skipped' | 'failed';
}

const fileId = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

/** Adds files to the plan (same file chosen twice is ignored); hidden files such as .DS_Store are left out. */
export function addToPlan(current: PlannedPhoto[], files: File[]): PlannedPhoto[] {
  const known = new Set(current.map((p) => p.id));
  const added = files
    .filter((f) => !f.name.startsWith('.') && !known.has(fileId(f)))
    .map((file): PlannedPhoto => ({ id: fileId(file), file, name: file.name, sku: null, problem: null }));
  return replan([...current, ...added.filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i)]);
}

export function removeFromPlan(current: PlannedPhoto[], id: string): PlannedPhoto[] {
  return replan(current.filter((p) => p.id !== id));
}

/** Works out SKU and local problems again (duplicates depend on the whole list). */
function replan(list: PlannedPhoto[]): PlannedPhoto[] {
  const seen = new Set<string>();
  return list.map((p) => {
    const parsed = skuFromFilename(p.name);
    if (!parsed.ok) return { ...p, sku: null, problem: parsed.message, problemStatus: 'failed' };
    if (p.file.size > PRODUCT_PHOTO_MAX_BYTES) return { ...p, sku: parsed.sku, problem: 'Photo must be 2 MB or smaller', problemStatus: 'failed' };
    const key = skuKey(parsed.sku);
    if (seen.has(key)) return { ...p, sku: parsed.sku, problem: 'Another file in this selection has this SKU', problemStatus: 'skipped' };
    seen.add(key);
    return { ...p, sku: parsed.sku, problem: null, problemStatus: undefined };
  });
}

export const sendable = (plan: PlannedPhoto[]) => plan.filter((p) => !p.problem);

/** Batches of ≤ 50 files and ≤ 40 MB each. */
export function toBatches(plan: PlannedPhoto[], maxFiles = BULK_MAX_FILES, maxBytes = BULK_MAX_BYTES): PlannedPhoto[][] {
  const batches: PlannedPhoto[][] = [];
  let cur: PlannedPhoto[] = [];
  let bytes = 0;
  for (const p of plan) {
    if (cur.length && (cur.length >= maxFiles || bytes + p.file.size > maxBytes)) {
      batches.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(p);
    bytes += p.file.size;
  }
  if (cur.length) batches.push(cur);
  return batches;
}
