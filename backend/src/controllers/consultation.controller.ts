// src/controllers/consultation.controller.ts — teleconsultations and their e-prescriptions (C-22..C-24)
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  bookConsultation, cancelConsultation, confirmPayment, doctorConsultations, endConsultation, joinConsultation, myConsultations, startPayment,
} from '../services/telemedicine/consultation.service';
import { issuePrescription, loadPrescription, useAtDawabag, verifyByCode } from '../services/telemedicine/eprescription.service';
import { renderEprescriptionPdf } from '../services/telemedicine/eprescriptionPdf';

const uuid = z.string().uuid();
const id = (req: Request) => uuid.parse(req.params.id);
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await fn(req, res); } catch (e) { next(e); }
};

export const postBook = wrap(async (req, res) => {
  const b = z.object({
    doctor_id: uuid, slot_id: uuid, patient_id: uuid.optional(), mode: z.enum(['video', 'audio', 'text']),
    chief_complaint: z.string().trim().min(3).max(1000),
    consent: z.literal(true, { errorMap: () => ({ message: 'Consent to a teleconsultation is required' }) }),
  }).parse(req.body);
  res.status(201).json({ success: true, data: await bookConsultation(req.user!.id, b) });
});
export const getMine = wrap(async (req, res) => res.json({ success: true, data: await myConsultations(req.user!.id) }));
export const getDoctorDay = wrap(async (req, res) => {
  const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default(new Date().toISOString().slice(0, 10)) }).parse(req.query);
  res.json({ success: true, data: await doctorConsultations(req.user!.id, date) });
});
export const postPay = wrap(async (req, res) => res.json({ success: true, data: await startPayment(req.user!.id, id(req)) }));
export const postPayVerify = wrap(async (req, res) => {
  const p = z.object({ razorpay_order_id: z.string().min(5), razorpay_payment_id: z.string().min(5), razorpay_signature: z.string().min(10) }).parse(req.body);
  res.json({ success: true, data: await confirmPayment(req.user!.id, id(req), p) });
});
export const getJoin = wrap(async (req, res) => res.json({ success: true, data: await joinConsultation(req.user!.id, id(req)) }));
export const postEnd = wrap(async (req, res) => {
  const { notes } = z.object({ notes: z.string().trim().max(5000).optional() }).parse(req.body ?? {});
  res.json({ success: true, data: await endConsultation(req.user!.id, id(req), notes) });
});
export const postCancel = wrap(async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(req.body);
  res.json({ success: true, data: await cancelConsultation(req.user!.id, id(req), reason) });
});
export const postPrescription = wrap(async (req, res) => {
  const d = z.object({
    diagnosis: z.string().trim().min(3).max(1000), advice: z.string().trim().max(2000).optional(), new_condition: z.boolean().optional(),
    items: z.array(z.object({
      product_id: uuid, dosage: z.string().trim().min(1).max(100), frequency: z.string().trim().min(1).max(100),
      duration_days: z.number().int().min(1).max(365), instructions: z.string().trim().max(500).optional(),
    })).min(1).max(20).refine((l) => new Set(l.map((i) => i.product_id)).size === l.length, 'Each medicine once'),
  }).parse(req.body);
  res.status(201).json({ success: true, data: await issuePrescription(req.user!.id, id(req), d) });
});
export const getPrescription = wrap(async (req, res) => res.json({ success: true, data: await loadPrescription(id(req), req.user!) }));
export const getPrescriptionPdf = wrap(async (req, res) => {
  const pdf = await renderEprescriptionPdf(await loadPrescription(id(req), req.user!));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="e-prescription-${req.params.id.slice(0, 8)}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(pdf);
});
export const postUseAtDawabag = wrap(async (req, res) => {
  const { order_id } = z.object({ order_id: uuid.optional() }).parse(req.body ?? {});
  res.json({ success: true, data: await useAtDawabag(req.user!.id, id(req), order_id) });
});
export const getVerify = wrap(async (req, res) => {
  const code = z.string().regex(/^[A-Za-z0-9]{10}$/).parse(req.params.code);
  res.json({ success: true, data: await verifyByCode(code) });
});
