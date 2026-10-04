// Sprint 46 — the catalogue suggestions workbook in memory: read the "suggestions" sheet
// of an uploaded .xlsx with the Sprint 45 reader (never written to disk — standing rule)
// and build the empty template on the fly (no template file kept on the server).
import ExcelJS from 'exceljs';
import { readXlsxSheet } from '../medicineInfo/importDrafts/workbook';
import { DOSAGE_FORMS, GST_RATES, SCHEDULES } from '../catalogueDrafts/rules';
import { PRODUCT_CLASSES } from '../productClass/rules';
import { MAX_SUGGESTION_ROWS, SUGGESTION_SHEET, TEMPLATE_COLUMNS } from './sheet';
import { BUYER_RESTRICTIONS } from '../buyerRestriction/rules';

export { MAX_DRAFT_FILE_BYTES as MAX_SUGGESTION_FILE_BYTES } from '../medicineInfo/importDrafts/workbook';

/** The "suggestions" sheet as rows of text cells (row 1 = heading). */
export function readSuggestionWorkbook(buffer: Buffer): Promise<string[][]> {
  return readXlsxSheet(buffer, { sheet: SUGGESTION_SHEET, columns: TEMPLATE_COLUMNS.length, maxRows: MAX_SUGGESTION_ROWS, what: 'the suggestions' });
}

/** The values each column accepts — shown on the template's how_to sheet and on the import page. */
export const ALLOWED_VALUES = {
  drug_schedule: SCHEDULES,
  dosage_form: DOSAGE_FORMS,
  product_class: PRODUCT_CLASSES,
  gst_rate: GST_RATES,
  cold_chain: ['yes', 'no'],
  is_new_drug: ['yes', 'no'],
  confidence: ['high', 'medium', 'low'],
  buyer_restriction: BUYER_RESTRICTIONS,   // Sprint 47, optional column
} as const;

/** An empty workbook: the "suggestions" sheet with its heading row, and a "how_to" sheet with the allowed values. */
export async function buildSuggestionTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Dawabag';
  const ws = wb.addWorksheet(SUGGESTION_SHEET);
  ws.addRow([...TEMPLATE_COLUMNS]);
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((c, i) => { c.width = i === 0 || TEMPLATE_COLUMNS[i] === 'note' ? 40 : 18; });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const help = wb.addWorksheet('how_to');
  [
    ['Catalogue suggestions for DRAFT products — one row per partner item'],
    ['item_name, pack, company: exactly as the partner\'s billing export prints them (used to find the partner\'s item linked to a draft product)'],
    ['generic_name, strength, category: text (optional). A category or HSN code not in Dawabag\'s lists is shown to the pharmacist as "new"'],
    [`dosage_form: one of ${ALLOWED_VALUES.dosage_form.join(', ')}`],
    [`drug_schedule: one of ${ALLOWED_VALUES.drug_schedule.join(', ')} (also H, H1, G, X). Schedule C / C1 is a separate yes/no the pharmacist sets`],
    ['cold_chain, is_new_drug: yes or no'],
    [`product_class: one of ${ALLOWED_VALUES.product_class.join(', ')}`],
    ['hsn_code: 4, 6 or 8 digits'],
    [`gst_rate: one of ${ALLOWED_VALUES.gst_rate.join(', ')}`],
    ['confidence: high, medium or low (required); note: anything the pharmacist should know (optional). A blank cell = no suggestion'],
    [`buyer_restriction (optional column; a file without it is fine): one of ${ALLOWED_VALUES.buyer_restriction.join(', ')} — practitioners_only = verified doctors and hospitals; trade_only = licensed retailers / wholesalers and verified doctors and hospitals. Only a suggestion: the pharmacist decides with a reason`],
    ['A suggestion is never a decision: the pharmacist checks every value against the pack and approves each product (C-10, C-19).'],
  ].forEach((r) => help.addRow(r));
  help.getColumn(1).width = 140;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
