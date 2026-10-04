// src/controllers/fulfilment.controller.ts — staff fulfilment (Sprint 4)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { listRiders, myRun, reassignRider, ridesShipment } from '../services/delivery/rider.service';
import { withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';
import { fulfilmentQueue, packShipment, dispatchOwnShipment, QueueStage } from '../services/fulfilment.service';
import { markShipmentDelivered } from '../services/partnerFulfilment.service';
import { applyPrescriptionToOrder, completePrescriberDetails, rejectPrescription, verifyPrescription } from '../services/rxVerification.service';
import { checkQueue, decideOwnShipment, orderCheckDetail } from '../services/pharmacistCheck/check.service';
import { h1IncompletePrescriptions } from '../services/h1Register/incomplete.service';

const uuid = z.string().uuid();

// Sealed, tamper-evident pack (C-26)
export const dispatchSchema = z.object({
  courier_partner: z.string().trim().min(2).max(50).optional(),   // optional when booked through the courier service
  rider_id: z.string().uuid().optional(),                         // Dawabag's own rider instead of a courier
  awb_number: z.string().trim().min(3).max(100).optional(),
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
const STAGE_ROLES: Record<QueueStage | 'check', string[]> = {
  rx: ['pharmacist_rx'],
  check: ['pharmacist_rx'],      // Sprint 35: every order's pharmacist check (C-08)
  pack: ['pharmacist_pack', 'admin', 'super_admin'],
  dispatch: ['pharmacist_pack', 'admin', 'super_admin'],
  deliver: ['delivery', 'pharmacist_pack', 'admin', 'super_admin'],   // packers see it to reassign riders
};

export async function getQueue(req: Request, res: Response, next: NextFunction) {
  try {
    const stage = z.enum(['rx', 'check', 'pack', 'dispatch', 'deliver']).parse(req.query.stage);
    if (!STAGE_ROLES[stage].includes(req.user!.role)) throw new AppError('Access denied', 403);
    if (stage === 'check') return res.json({ success: true, data: { stage, items: await checkQueue() } });
    // Riders get their own run sheet, never the whole delivery queue
    if (req.user!.role === 'delivery') return res.json({ success: true, data: { stage, items: await myRun(req.user!.id) } });
    res.json({ success: true, data: { stage, items: await fulfilmentQueue(stage) } });
  } catch (err) { next(err); }
}

const verifySchema = z.object({
  prescriber_name: z.string().trim().min(3).max(255),
  prescriber_reg_no: z.string().trim().min(3).max(100),
  // Sprint 38: the Schedule H1 register needs the prescriber's address (C-09)
  prescriber_address: z.string({ required_error: "Enter the prescriber's address as written on the prescription" })
    .trim().min(5, "Enter the prescriber's address as written on the prescription").max(500),
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

// Sprint 38: fill in prescriber details a prescription verified before Sprint 38 lacks
// (only empty fields; everything else on a verified prescription is frozen, C-08 / C-09)
export const prescriberDetailsSchema = z.object({
  prescriber_address: z.string().trim().min(5).max(500).optional(),
  prescriber_reg_no: z.string().trim().min(3).max(100).optional(),
}).refine((b) => b.prescriber_address || b.prescriber_reg_no, 'Enter the prescriber\'s address or registration number');

export async function getH1Incomplete(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: { prescriptions: await h1IncompletePrescriptions() } }); } catch (err) { next(err); }
}

export async function postPrescriberDetails(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await completePrescriberDetails(req.user!.id, uuid.parse(req.params.id), prescriberDetailsSchema.parse(req.body)) });
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

// Sprint 35 — the pharmacist check on every order (C-08): release, hold or refuse
export const checkDecisionSchema = z.object({
  decision: z.enum(['release', 'hold', 'reject']),
  reason: z.string().trim().max(500).optional(),
  // Sprint 48: how many buyer changes the check screen showed (409 ORDER_CHANGED if the order changed since)
  edits_seen: z.number().int().min(0).max(10000).optional(),
});

export async function getOrderCheck(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await orderCheckDetail(uuid.parse(req.params.orderId)) }); } catch (err) { next(err); }
}

export async function postCheck(req: Request, res: Response, next: NextFunction) {
  try {
    const { decision, reason, edits_seen } = checkDecisionSchema.parse(req.body);
    res.json({ success: true, data: await decideOwnShipment(req.user!.id, uuid.parse(req.params.id), decision, reason, { editsSeen: edits_seen }) });
  } catch (err) { next(err); }
}

export async function postPack(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await packShipment(uuid.parse(req.params.id), req.user!.id) }); } catch (err) { next(err); }
}

export async function postDispatch(req: Request, res: Response, next: NextFunction) {
  try {
    const { courier_partner, awb_number, rider_id, ...record } = dispatchSchema.parse(req.body);
    if (rider_id && (courier_partner || awb_number)) throw new AppError('Choose a rider or a courier, not both', 400);
    res.json({ success: true, data: await dispatchOwnShipment(uuid.parse(req.params.id), courier_partner, awb_number, req.user!.id, record, rider_id) });
  } catch (err) { next(err); }
}

export async function postDelivered(req: Request, res: Response, next: NextFunction) {
  try {
    const id = uuid.parse(req.params.id);
    // A rider closes only the parcels assigned to them
    if (req.user!.role === 'delivery' && !(await ridesShipment(req.user!.id, id))) throw new AppError('Shipment not found', 404);
    res.json({ success: true, data: await markShipmentDelivered(id, req.user!, undefined, handoverSchema.parse(req.body ?? {})) });
  } catch (err) { next(err); }
}

// GET /fulfilment/h1-register — moved to h1Register.controller.ts (Sprint 38: per seller licence, chain check)

// PATCH /admin/users/:userId/pharmacist { pharmacist_reg_no } — required before a pharmacist reviews
export async function setPharmacistRegistration(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = uuid.parse(req.params.userId);
    const { pharmacist_reg_no } = z.object({ pharmacist_reg_no: z.string().trim().min(3).max(50) }).parse(req.body);
    // A regulated change and its audit entry commit together (Sprint 38, C-46)
    await withTransaction(async (c) => {
      const r = await c.query(`UPDATE users SET pharmacist_reg_no = $2, updated_at = NOW()
                               WHERE id = $1 AND role IN ('pharmacist_rx', 'pharmacist_pack') RETURNING id`, [userId, pharmacist_reg_no]);
      if (!r.rowCount) throw new AppError('Pharmacist account not found', 404);
      await writeAuditTx(c, { userId, action: 'pharmacist_registration_set', performedBy: req.user!.id, newValue: { pharmacist_reg_no } });
    });
    res.json({ success: true, data: { user_id: userId, pharmacist_reg_no } });
  } catch (err) { next(err); }
}

// GET /fulfilment/riders — for dispatch; GET /fulfilment/my-run — the rider's parcels
export async function getRiders(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await listRiders() }); } catch (err) { next(err); }
}
export async function getMyRun(req: Request, res: Response, next: NextFunction) {
  try { res.json({ success: true, data: await myRun(req.user!.id) }); } catch (err) { next(err); }
}
export async function postReassignRider(req: Request, res: Response, next: NextFunction) {
  try {
    const { rider_id } = z.object({ rider_id: z.string().uuid() }).parse(req.body);
    res.json({ success: true, data: await reassignRider(req.user!.id, uuid.parse(req.params.id), rider_id) });
  } catch (err) { next(err); }
}
