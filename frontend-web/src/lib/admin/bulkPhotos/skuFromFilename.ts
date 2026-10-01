// Bulk pack photos: a file is named after its product's SKU — "PARA-500.jpg" →
// SKU "PARA-500". Mirrors backend/src/utils/skuFromFilename.ts so the page can
// show the mapping before upload; the server decides again (and matches the SKU).
export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;
const SKU_MAX = 100;

export type ParsedPhotoName = { ok: true; sku: string } | { ok: false; message: string };

export function skuFromFilename(filename: string): ParsedPhotoName {
  const base = (filename.split(/[\\/]/).pop() ?? '').trim();
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return { ok: false, message: 'File name must be <SKU>.jpg, .jpeg, .png or .webp' };
  const ext = base.slice(dot + 1).toLowerCase();
  if (!(PHOTO_EXTENSIONS as readonly string[]).includes(ext)) return { ok: false, message: 'Only .jpg, .jpeg, .png and .webp files are accepted' };
  const sku = base.slice(0, dot).trim();
  if (!sku) return { ok: false, message: 'File name has no SKU before the extension' };
  if (sku.length > SKU_MAX) return { ok: false, message: `SKU in the file name is longer than ${SKU_MAX} characters` };
  return { ok: true, sku };
}

/** Case-insensitive key: the server matches SKUs without regard to case. */
export const skuKey = (sku: string) => sku.trim().toUpperCase();
