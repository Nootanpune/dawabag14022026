// src/utils/skuFromFilename.ts — bulk pack-photo upload: a photo file is named
// after the product's SKU, e.g. "PARA-500.jpg" → SKU "PARA-500". The name without
// its extension must be the whole SKU (no suffixes); matching is case-insensitive.
// The website mirrors this rule in lib/admin/bulkPhotos/skuFromFilename.ts.

export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;
export type PhotoExtension = (typeof PHOTO_EXTENSIONS)[number];

const MIME_BY_EXT: Record<PhotoExtension, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};

const SKU_MAX = 100;   // products.sku VARCHAR(100)

export type ParsedPhotoName =
  | { ok: true; sku: string; ext: PhotoExtension; mimetype: string }
  | { ok: false; message: string };

/** Splits "<SKU>.<jpg|jpeg|png|webp>" (any folder part is ignored). */
export function skuFromFilename(filename: string): ParsedPhotoName {
  const base = String(filename ?? '').split(/[\\/]/).pop()!.trim();
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return { ok: false, message: 'File name must be <SKU>.jpg, .jpeg, .png or .webp' };
  const ext = base.slice(dot + 1).toLowerCase();
  if (!(PHOTO_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ok: false, message: 'Only .jpg, .jpeg, .png and .webp files are accepted' };
  }
  const sku = base.slice(0, dot).trim();
  if (!sku) return { ok: false, message: 'File name has no SKU before the extension' };
  if (sku.length > SKU_MAX) return { ok: false, message: `SKU in the file name is longer than ${SKU_MAX} characters` };
  return { ok: true, sku, ext: ext as PhotoExtension, mimetype: MIME_BY_EXT[ext as PhotoExtension] };
}

/** Case-insensitive key used to match a file to a product and to spot duplicates. */
export const skuKey = (sku: string) => sku.trim().toUpperCase();
