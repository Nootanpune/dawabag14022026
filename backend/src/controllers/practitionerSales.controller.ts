// Sales to doctors and medical institutions (Sprint 44; Drugs Rules 1945 r.64(2), r.65(9)(b);
// FDA Maharashtra (Pune Division) circular No. Drug/Wholesalers Memo./16/2026/1, 30-09-2026):
//   buyer   GET  /practitioner-sales/me                         registration status, can order
//   buyer   POST /written-orders/upload (file)                  (a) a signed requisition
//           POST /written-orders/requisition/preview {items}    the text to sign
//           POST /written-orders/requisition {items, typed_name, password, declaration}   (b) signed in the app
//           GET  /written-orders/mine                           not yet used, to pick at checkout
//   viewers GET  /written-orders/:id · /:id/link · /:id/document.pdf · /:id/certificate
//   staff   GET  /practitioner-sales/practitioners?filter=attention|all
//           POST /practitioner-sales/practitioners/:userId/registration {decision, …}
//           GET  /practitioner-sales/register?from&to[&partner_id][&format=csv]
//   partner GET  /partner/practitioner-sales?from&to[&format=csv]   (its own sales)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { writeAudit } from '../utils/audit';
import { toCsv } from '../utils/csv';
import { verifySignedPath } from '../utils/signedLink';
import { decideRegistration, listPractitioners, myRegistration } from '../services/practitionerSales/registration.service';
import {
  certificateLink, getWrittenOrder, myWrittenOrders, previewRequisition, signRequisition, uploadWrittenOrder, writtenOrderLink, writtenOrderPdf,
} from '../services/practitionerSales/writtenOrder.service';
import { PRACTITIONER_REGISTER_COLUMNS, practitionerSalesRegister } from '../services/practitionerSales/register.service';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const items = z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(100000) })).min(1).max(100);
const meta = (req: Request) => ({ ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null });
const viewer = (req: Request) => ({ id: req.user!.id, role: req.user!.role });

export async function getMyPractitionerRegistration(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await myRegistration(req.user!.id) }); } catch (e) { next(e); }
}

export async function postWrittenOrderUpload(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json({ success: true, data: await uploadWrittenOrder(req.user!.id, req.file, meta(req)) }); } catch (e) { next(e); }
}

export async function postRequisitionPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const b = z.object({ items }).parse(req.body);
    res.json({ success: true, data: await previewRequisition(req.user!.id, b.items) });
  } catch (e) { next(e); }
}

export async function postRequisition(req: Request, res: Response, next: NextFunction) {
  try {
    const b = z.object({ items, typed_name: z.string().trim().min(3).max(200), password: z.string().min(1).max(200), declaration: z.boolean() })
      .parse(req.body);
    res.status(201).json({ success: true, data: await signRequisition(req.user!.id, b, meta(req)) });
  } catch (e) { next(e); }
}

export async function getMyWrittenOrders(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { written_orders: await myWrittenOrders(req.user!.id) } }); } catch (e) { next(e); }
}

export async function getWrittenOrderOne(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await getWrittenOrder(viewer(req), uuid.parse(req.params.id)) }); } catch (e) { next(e); }
}

export async function getWrittenOrderLink(req: Request, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.id);
    res.json({ success: true, data: { ...(await writtenOrderLink(viewer(req), id, `${req.baseUrl}/${id}/document.pdf`)), expires_in: 300 } });
  } catch (e) { next(e); }
}

export async function getWrittenOrderPdf(req: Request, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.id);
    const signed = verifySignedPath(req.baseUrl + req.path, req.query.exp, req.query.sig);
    if (!signed && !req.user) throw new AppError('Written order not found', 404);
    const doc = await writtenOrderPdf(signed ? null : viewer(req), id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(doc.pdf);
  } catch (e) { next(e); }
}

export async function getWrittenOrderCertificate(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { ...(await certificateLink(viewer(req), uuid.parse(req.params.id))), expires_in: 300 } }); } catch (e) { next(e); }
}

export async function getPractitioners(req: Request, res: Response, next: NextFunction) {
  try {
    const { filter } = z.object({ filter: z.enum(['attention', 'all']).default('attention') }).parse(req.query);
    res.json({ success: true, data: { practitioners: await listPractitioners(filter) } });
  } catch (e) { next(e); }
}

export async function postPractitionerRegistration(req: Request, res: Response, next: NextFunction) {
  try {
    const d = z.object({
      decision: z.enum(['verify', 'reject', 'suspend']),
      registration_number: z.string().trim().min(2).max(50),
      council: z.string().trim().min(2).max(50),
      valid_till: date.nullable().optional(),
      name_as_per_register: z.string().trim().max(200).nullable().optional(),
      qualification: z.string().trim().max(100).nullable().optional(),
      kind: z.enum(['doctor', 'institution']).optional(),
      reason: z.string().trim().max(1000).nullable().optional(),
      notes: z.string().trim().max(1000).nullable().optional(),
    }).parse(req.body);
    res.json({ success: true, data: await decideRegistration(req.user!.id, uuid.parse(req.params.userId), d) });
  } catch (e) { next(e); }
}

async function sendRegister(req: Request, res: Response, partnerId: string | undefined) {
  const q = z.object({ from: date, to: date, format: z.enum(['json', 'csv']).default('json'), partner_id: uuid.optional() }).parse(req.query);
  if (q.from > q.to) throw new AppError('The period starts after it ends', 400);
  const rows = await practitionerSalesRegister({ from: q.from, to: q.to, partnerId: partnerId ?? q.partner_id });
  // Recorded before anything leaves (C-46)
  await writeAudit({ userId: null, action: 'practitioner_sales_register_exported', performedBy: req.user!.id,
    newValue: { from: q.from, to: q.to, rows: rows.length, format: q.format, partner_id: partnerId ?? q.partner_id ?? null } });
  if (q.format === 'json') return res.json({ success: true, data: { from: q.from, to: q.to, rows } });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sales-to-doctors-${q.from}-to-${q.to}.csv"`);
  res.send(toCsv([...PRACTITIONER_REGISTER_COLUMNS], rows as any));
}

export async function getPractitionerRegister(req: Request, res: Response, next: NextFunction) {
  try { await sendRegister(req, res, undefined); } catch (e) { next(e); }
}
export async function getPartnerPractitionerRegister(req: Request, res: Response, next: NextFunction) {
  try { await sendRegister(req, res, req.partner!.vendorId); } catch (e) { next(e); }
}
