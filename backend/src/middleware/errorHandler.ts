import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';

// Never write secrets, personal identifiers or health data from a request body to the logs (C-41)
const REDACTED_FIELDS = new Set([
  'password', 'otp', 'refresh_token', 'pan_number', 'gstin',
  'drug_license_number', 'nmc_reg_number', 'email', 'mobile',
  'diagnosis', 'advice', 'chief_complaint', 'notes', 'items', 'reason', 'instructions', 'patient_name', 'address_line1', 'address_line2',
]);

function redact(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([k, v]) =>
      [k, REDACTED_FIELDS.has(k) ? '[redacted]' : v])
  );
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  logger.error(`${req.method} ${req.path} — ${err.message}`, {
    request_id: req.id,
    stack: err.stack,
    body: redact(req.body),
    user: req.user?.id,
  });

  // Responses carry `message` (API contract) and `error` (older clients).
  // request_id lets support find this failure in the logs
  const fail = (status: number, message: string, extra: object = {}) =>
    res.status(status).json({ success: false, message, error: message, request_id: req.id, ...extra });

  // Zod validation errors
  if (err instanceof ZodError) {
    const errors = err.errors.map((e) => ({ path: e.path.join('.'), message: e.message }));
    return fail(422, errors[0]?.message || 'Validation error', { errors });
  }

  // App errors (operational)
  if (err instanceof AppError) {
    return fail(err.statusCode, err.message);
  }

  // Upload limits (multer)
  if ((err as any).code === 'LIMIT_FILE_SIZE') {
    return fail(413, 'File is too large');
  }

  // PostgreSQL errors
  // Lock wait timed out (e.g. many checkouts of one medicine at once): ask to retry
  if ((err as any).code === '55P03') {
    return fail(503, 'We are busy right now. Please try again in a moment.');
  }
  if ((err as any).code === '23505') {
    return fail(409, 'Duplicate entry. This record already exists.');
  }

  // Business rules enforced by the database (e.g. price ≤ MRP, C-16)
  if ((err as any).code === '23514') {
    const constraint = (err as any).constraint as string | undefined;
    const known: Record<string, string> = {
      products_price_le_mrp: 'Selling prices cannot exceed the MRP',
      products_mrp_le_ceiling: 'MRP cannot exceed the NPPA ceiling price',
    };
    return fail(400, (constraint && known[constraint]) || 'This change breaks a business rule');
  }

  if ((err as any).code === '23503') {
    return fail(400, 'Referenced record not found.');
  }

  // Default server error
  const isDev = process.env.NODE_ENV === 'development';
  return fail(500, 'Internal server error', isDev ? { details: err.message, stack: err.stack } : {});
}

export function notFound(req: Request, res: Response) {
  const message = `Route ${req.method} ${req.path} not found`;
  res.status(404).json({ success: false, message, error: message });
}
