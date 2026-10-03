// Product class and the new-drug flag (Sprint 40; handover D6; C-10). The server enforces:
// a medical device is never allowed for online sale until a device track exists, and a new
// drug (NDCT Rules 2019) only with a pharmacist's confirmation note.
export const PRODUCT_CLASSES = ['drug', 'device', 'cosmetic', 'ayush', 'general'] as const;
export type ProductClass = (typeof PRODUCT_CLASSES)[number];
export const PRODUCT_CLASS_LABELS: Record<ProductClass, string> = {
  drug: 'Drug (medicine)', device: 'Medical device', cosmetic: 'Cosmetic', ayush: 'AYUSH medicine', general: 'General product',
};
export const NEW_DRUG_CONFIRMATION_MIN = 20;
