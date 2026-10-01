// src/controllers/fulfilment.controller.ts — staff fulfilment (Sprint 4)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAudit } from '../utils/audit';
import { toCsv } from '../utils/csv';
import { fulfilmentQueue, packShipment, dispatchOwnShipment, QueueStage } from '../services/fulfilment.service';
import { markShipmentDelivered } from '../services/partnerFulfilment.service';
import { applyPrescriptionToOrder, rejectPrescription, verifyPrescription } from '../services/rxVerification.service';

const uuid = z.string().uuid();

// Sealed, tamper-evident pack (C-26)
export const dispatchSchema = z.object({
  courier_partner: z.string().trim().min(2).max(50),
  awb_number: z.string().trim().min(3).max(100),
  seal_number: z.string().trim().min(3).max(50),
  // Cold-chain shipments only (C-25)
  cold_chain_temp_c: z.number().min(-30).max(40).optional(),
  cold_chain_logger_id: z.string().trim().min(2).max(60).optional(),
});
// Handover to the patient or an adult at the address (C-26)
export const handoverSchema = z.object({
  code: z.string().regex(/^\d{6}$/).optional(),
  received_by_name: z.string().trim().min(2).max(100).optional(),
  received_by_relation: z.enum(['self', 'family_adult', 'other_adult']).optional(),
  override_reason: z.string().trim().min(10).max(500).optional(),
});
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Which roles may see which stage
const STAGE_ROLES: Record<QueueStage, string[]> = {
  rx: ['pharmacist_rx'],
  pack: ['pharmacist_pack', 'admin', 'super_admin'],
  dispatch: ['pharmacist_pack', 'admin', 'super_admin'],
  deliver: ['delivery', 'admin', 'super_admin'],
};

export async function getQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const stage = z.enum(['rx', 'pack', 'dispatch', 'deliver']).parse(req.query.stage);
    if (!STAGE_ROLES[stage].includes(req.user!.role)) throw new AppError('Access denied', 403);
    res.json({ success: true, data: { stage, items: await fulfilmentQueue(stage) } });
  } catch (err) { next(err); }
}

const verifySchema = z.object({
  prescriber_name: z.string().trim().min(3).max(255),
  prescriber_reg_no: z.string().trim().min(3).max(100),
  prescribed_on: date,
  patient_name: z.string().trim().min(2).max(255),
  valid_days: z.number().int().min(1).max(365).default(180),
  items: z.array(z.object({ product_id: uuid, prescribed_qty: z.number().int().min(1).max(10000) })).min(1),
  notes: z.string().max(1000).optional(),
});

export async function postVerify(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await verifyPrescription(req.user!.id, uuid.parse(req.params.id), verifySchema.parse(req.body)) });
  } catch (err) { next(err); }
}

export async function postReject(req: Request, res: Response, next: NextFunction) {
  try {
    const { reason } = z.object({ reason: z.string().trim().min(5).max(500) }).parse(req.body);
    res.json({ success: true, data: await rejectPrescription(req.user!.id, uuid.parse(req.params.id), reason) });
  } catch (err) { next(err); }
}

export async function postApply(req: Request, res: Response, next: NextFunction) {
  try {
    const { order_id } = z.object({ order_id: uuid }).parse(req.body);
    res.json({ success: true, data: await applyPrescriptionToOrder(req.user!.id, uuid.parse(req.params.id), order_id) });
  } catch (err) { next(err); }
}

export async function postPack(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await packShipment(uuid.parse(req.params.id), req.user!.id) }); } catch (err) { next(err); }
}

export async function postDispatch(req: Request, res: Response, next: NextFunction) {
  try {
    const { courier_partner, awb_number, ...record } = dispatchSchema.parse(req.body);
    res.json({ success: true, data: await dispatchOwnShipment(uuid.parse(req.params.id), courier_partner, awb_number, req.user!.id, record) });
  } catch (err) { next(err); }
}

export async function postDelivered(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await markShipmentDelivered(uuid.parse(req.params.id), req.user!, undefined, handoverSchema.parse(req.body ?? {})) });
  } catch (err) { next(err); }
}

// GET /fulfilment/h1-register?from=&to=&format=csv — inspector export (C-09).
// Built from the database on each request; nothing is written to disk.
export async function getH1Register(req: Request, res: Response, next: NextFunction) {
  try {
    const { from, to, format } = z.object({ from: date, to: date, format: z.enum(['json', 'csv']).default('json') }).parse(req.query);
    const rows = await query<any>(
      `SELECT h.dispensed_at, h.seller_type, v.name AS partner_name, o.order_number, h.product_name, h.batch_number,
              h.quantity, h.patient_name, h.patient_address, h.prescriber_name, h.prescriber_reg_no,
              h.pharmacist_name, h.pharmacist_reg_no
       FROM h1_register h JOIN orders o ON o.id = h.order_id LEFT JOIN vendors v ON v.id = h.partner_id
       WHERE h.dispensed_at::date BETWEEN $1 AND $2 ORDER BY h.dispensed_at`, [from, to]);
    await writeAudit({ userId: null, action: 'h1_register_exported', performedBy: req.user!.id, newValue: { from, to, rows: rows.length, format } });
    if (format === 'json') return res.json({ success: true, data: { from, to, entries: rows } });

    const cols = ['dispensed_at', 'seller_type', 'partner_name', 'order_number', 'product_name', 'batch_number', 'quantity',
      'patient_name', 'patient_address', 'prescriber_name', 'prescriber_reg_no', 'pharmacist_name', 'pharmacist_reg_no'];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="h1-register-${from}-to-${to}.csv"`);
    res.send(toCsv(cols, rows));
  } catch (err) { next(err); }
}

// PATCH /admin/users/:userId/pharmacist { pharmacist_reg_no } — required before a pharmacist reviews
export async function setPharmacistRegistration(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = uuid.parse(req.params.userId);
    const { pharmacist_reg_no } = z.object({ pharmacist_reg_no: z.string().trim().min(3).max(50) }).parse(req.body);
    const r = await query(`UPDATE users SET pharmacist_reg_no = $2, updated_at = NOW()
                           WHERE id = $1 AND role IN ('pharmacist_rx', 'pharmacist_pack') RETURNING id`, [userId, pharmacist_reg_no]);
    if (!r.length) throw new AppError('Pharmacist account not found', 404);
    await writeAudit({ userId, action: 'pharmacist_registration_set', performedBy: req.user!.id, newValue: { pharmacist_reg_no } });
    res.json({ success: true, data: { user_id: userId, pharmacist_reg_no } });
  } catch (err) { next(err); }
}
