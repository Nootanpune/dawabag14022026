// src/controllers/h1Register.controller.ts — Schedule H1 register reports and chain
// checks (C-09), and the audit-log chain check (C-46). Sprint 38.
//   Staff:   GET /fulfilment/h1-register?from&to[&register_key][&partner_id][&format=csv]
//            GET /fulfilment/h1-register/registers · GET /fulfilment/h1-register/verify[?register_key&from]
//   Partner: GET /partner/h1-register?from&to[&format=csv] · /partner/h1-register/verify  (own registers only)
//   Admin:   GET /admin/audit-chain/verify[?from]
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { writeAudit } from '../utils/audit';
import { toCsv } from '../utils/csv';
import { H1_EXPORT_COLUMNS, listH1Entries, listH1Registers } from '../services/h1Register/report.service';
import { verifyH1Register, verifyH1Registers } from '../services/chainVerify/h1.service';
import { verifyAuditChain } from '../services/chainVerify/audit.service';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const listQuery = z.object({
  from: date, to: date, format: z.enum(['json', 'csv']).default('json'),
  register_key: z.string().trim().min(3).max(160).optional(),
  partner_id: z.string().uuid().optional(),
});
const verifyQuery = z.object({
  register_key: z.string().trim().min(3).max(160).optional(),
  from: z.coerce.number().int().min(1).optional(),
});

async function sendRegister(req: Request, res: Response, partnerId: string | undefined) {
  const q = listQuery.parse(req.query);
  const rows = await listH1Entries({ from: q.from, to: q.to, partnerId: partnerId ?? q.partner_id, registerKey: q.register_key });
  // Recorded before anything leaves: if the audit log cannot be written, nothing is sent (C-46)
  await writeAudit({ userId: null, action: 'h1_register_exported', performedBy: req.user!.id,
    newValue: { from: q.from, to: q.to, rows: rows.length, format: q.format, partner_id: partnerId ?? q.partner_id ?? null, register_key: q.register_key ?? null } });
  if (q.format === 'json') {
    return res.json({ success: true, data: { from: q.from, to: q.to, entries: rows, registers: await listH1Registers(partnerId) } });
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="h1-register-${q.from}-to-${q.to}.csv"`);
  res.send(toCsv([...H1_EXPORT_COLUMNS], rows));
}

export async function getH1Register(req: Request, res: Response, next: NextFunction) {
  try { await sendRegister(req, res, undefined); } catch (err) { next(err); }
}
export async function getPartnerH1Register(req: Request, res: Response, next: NextFunction) {
  try { await sendRegister(req, res, req.partner!.vendorId); } catch (err) { next(err); }
}

export async function getH1Registers(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { registers: await listH1Registers() } }); } catch (err) { next(err); }
}

export async function getH1Verify(req: Request, res: Response, next: NextFunction) {
  try {
    const q = verifyQuery.parse(req.query);
    const registers = q.register_key ? [await verifyH1Register(q.register_key, { from: q.from })] : (await verifyH1Registers()).registers;
    const data = { ok: registers.every((r) => r.ok), registers };
    await writeAudit({ userId: null, action: 'h1_register_verified', performedBy: req.user!.id,
      newValue: { ok: data.ok, registers: data.registers.map((r) => ({ register_key: r.register_key, ok: r.ok, checked: r.checked, first_break: r.first_break })) } });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getPartnerH1Verify(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await verifyH1Registers({ partnerId: req.partner!.vendorId }) }); } catch (err) { next(err); }
}

export async function getAuditChainVerify(req: Request, res: Response, next: NextFunction) {
  try {
    const { from } = verifyQuery.parse(req.query);
    const data = await verifyAuditChain({ from });
    // (The check's own entry joins the chain after the part it checked.)
    await writeAudit({ userId: null, action: 'audit_chain_verified', performedBy: req.user!.id,
      newValue: { ok: data.ok, checked: data.checked, last_no: data.last_no, first_break: data.first_break } });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
