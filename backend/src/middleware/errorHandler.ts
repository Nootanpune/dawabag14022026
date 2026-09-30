import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';

// Never write secrets or personal identifiers from a request body to the logs
const REDACTED_FIELDS = new Set([
  'password', 'otp', 'refresh_token', 'pan_number', 'gstin',
  'drug_license_number', 'nmc_reg_number', 'email', 'mobile',
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
    stack: err.stack,
    body: redact(req.body),
    user: req.user?.id,
  });

  // Responses carry `message` (API contract) and `error` (older clients).
  const fail = (status: number, message: string, extra: object = {}) =>
    res.status(status).json({ success: false, message, error: message, ...extra });

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
  if ((err as any).code === '23505') {
    return fail(409, 'Duplicate entry. This record already exists.');
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
