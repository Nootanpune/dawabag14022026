// src/utils/csv.ts — CSV built in memory for downloads (nothing written to disk).
// Cells that start with = + - @ (or a tab / carriage return) are prefixed with ' so a spreadsheet does not run
// them as formulas (names and addresses come from buyers).
export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const cell = (v: unknown) => {
    let t = v instanceof Date ? v.toISOString() : v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = `'${t}`;
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\n');
}
