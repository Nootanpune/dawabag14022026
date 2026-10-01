// src/controllers/accounts.controller.ts — GET /accounts/reports/:name?from&to&format=csv
// For the CA: GST registers and marketplace TCS/TDS, built on request (C-30, C-32, C-34).
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { REPORTS, ReportName } from '../services/gstReports.service';
import { writeAudit } from '../utils/audit';
import { toCsv } from '../utils/csv';
import { AppError } from '../utils/AppError';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function getReport(req: Request, res: Response, next: NextFunction) {
  try {
    const name = z.enum(Object.keys(REPORTS) as [ReportName, ...ReportName[]]).parse(req.params.name);
    const { from, to, format } = z.object({ from: date, to: date, format: z.enum(['json', 'csv']).default('json') }).parse(req.query);
    if (from > to) throw new AppError('from must be on or before to', 400);
    if ((Date.parse(to) - Date.parse(from)) / 864e5 > 400) throw new AppError('Choose a period of up to 13 months', 400);
    const rows = (await REPORTS[name]({ from, to })) as Record<string, unknown>[];
    await writeAudit({ userId: null, action: 'accounts_report_exported', performedBy: req.user!.id, newValue: { report: name, from, to, rows: rows.length, format } });
    if (format === 'json') return res.json({ success: true, data: { report: name, from, to, rows } });
    const columns = rows.length ? Object.keys(rows[0]) : ['no_rows'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}-${from}-to-${to}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(toCsv(columns, rows));
  } catch (err) { next(err); }
}

export function listReports(_req: Request, res: Response) {
  res.json({ success: true, data: { reports: Object.keys(REPORTS) } });
}
