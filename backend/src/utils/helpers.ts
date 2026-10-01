import { istMonth, istYear } from './ist';
export function generateOrderNumber(): string {
  const year = String(istYear()).slice(-2);           // order numbers carry the Indian month
  const month = String(istMonth()).padStart(2, '0');
  const random = Math.floor(10000 + Math.random() * 90000);
  return `DWB-${year}${month}-${random}`;
}

export function paiseToCurrency(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

export function calculateGST(
  amountPaise: number,
  gstRate: number,
  isInterState: boolean
): { cgst: number; sgst: number; igst: number; total: number } {
  const total = Math.round(amountPaise * gstRate / 100);
  if (isInterState) {
    return { cgst: 0, sgst: 0, igst: total, total };
  }
  const half = Math.round(total / 2);
  return { cgst: half, sgst: half, igst: 0, total };
}

export function generateReferralCode(name: string): string {
  const prefix = name.replace(/[^a-zA-Z]/g, '').substring(0, 4).toUpperCase();
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${suffix}`;
}

export function maskMobile(mobile: string): string {
  return mobile.substring(0, 4) + 'XXXXXX' + mobile.substring(10);
}
