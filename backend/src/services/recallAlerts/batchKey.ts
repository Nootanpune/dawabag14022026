// Batch numbers on regulator lists and on our invoices differ in spacing and
// punctuation ("AB-1234" / "AB 1234" / "ab1234"); they are compared on letters and
// digits only, upper case (C-28). BATCH_KEY_SQL is the same rule in SQL.
export function batchKey(batchNumber: string): string {
  return String(batchNumber ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export const batchKeySql = (column: string) => `upper(regexp_replace(${column}, '[^A-Za-z0-9]', '', 'g'))`;
