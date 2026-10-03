import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';

// Never write secrets, personal identifiers or health data from a request body to the logs (C-41)
const REDACTED_FIELDS = new Set([
  'password', 'otp', 'temporary_password', 'current_password', 'new_password', 'logins', 'refresh_token', 'pan_number', 'gstin',
  'drug_license_number', 'nmc_reg_number', 'email', 'mobile',
  'diagnosis', 'advice', 'chief_complaint', 'notes', 'items', 'reason', 'instructions', 'patient_name', 'address_line1', 'address_line2',
  // Sprint 33: health profile and dose reminders are health data
  'allergies', 'conditions', 'current_medicines', 'medicine_name', 'dose', 'full_name',
  // Sprint 34 review: licence numbers in the newer licence rows, relationship and age of family members
  'licence_number', 'relationship', 'age_years',
]);

/**
 * Request body for the error log with the fields above blanked at ANY depth — family
 * members, licence rows and order lines are nested (security review Sprint 34, C-41).
 */
export function redact(body: unknown, depth = 0): unknown {
  if (!body || typeof body !== 'object') return body;
  if (depth > 6) return '[nested]';
  if (Array.isArray(body)) return body.slice(0, 20).map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).map(([k, v]) =>
      [k, REDACTED_FIELDS.has(k) ? '[redacted]' : redact(v, depth + 1)])
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
    return fail(err.statusCode, err.message, err.code ? { code: err.code } : {});
  }

  // Upload limits (multer)
  if ((err as any).code === 'LIMIT_FILE_SIZE') {
    return fail(413, 'File is too large');
  }

  // Request body errors from express.json (Sprint 37: a connector's snapshot that is too
  // large or not JSON gets a plain 413 / 400, not a server error)
  if ((err as any).type === 'entity.too.large') return fail(413, 'The request body is too large');
  if ((err as any).type === 'entity.parse.failed') return fail(400, 'The request body is not valid JSON');

  // PostgreSQL errors
  // Lock wait timed out (e.g. many checkouts of one medicine at once): ask to retry
  if ((err as any).code === '55P03') {
    return fail(503, 'We are busy right now. Please try again in a moment.');
  }
  // Two transactions waited on each other, or a serialisation conflict: safe to try again
  if ((err as any).code === '40P01' || (err as any).code === '40001') {
    return fail(503, 'We are busy right now. Please try again in a moment.');
  }
  // A rule raised by a record trigger (Sprint 38: final records, frozen prescriptions,
  // the dispense ledger; C-08, C-34, C-46). Those messages are ours and plain.
  if ((err as any).code === 'P0001') {
    return fail(409, err.message);
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
      // Sprint 29: drafts and Schedule X / NDPS approvals are never active (C-10, C-19)
      products_active_only_live: 'Only an approved product can be put on sale',
      products_decided_unless_draft: 'Schedule, category and GST rate must be set before a product leaves draft',
      // Sprint 34: the database refuses a NEW choice of a switched-off list entry (any path)
      products_category_switched_off: 'This category is switched off in Admin → Catalogue lists. Choose another category, or ask an admin to switch it back on',
      // Sprint 38: an H1 register entry is complete or it is not written (C-09)
      h1_register_complete: 'The Schedule H1 register entry is incomplete; the parcel was not dispatched',
      products_hsn_switched_off: 'This HSN code is switched off in Admin → Catalogue lists. Choose another code, or ask an admin to switch it back on',
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
