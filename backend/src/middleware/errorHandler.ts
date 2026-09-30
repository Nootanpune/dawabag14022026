import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  logger.error(`${req.method} ${req.path} — ${err.message}`, {
    stack: err.stack,
    body: req.body,
    user: req.user?.id,
  });

  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(422).json({
      success: false,
      error: 'Validation error',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // App errors (operational)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
    });
  }

  // PostgreSQL errors
  if ((err as any).code === '23505') {
    return res.status(409).json({
      success: false,
      error: 'Duplicate entry. This record already exists.',
    });
  }

  if ((err as any).code === '23503') {
    return res.status(400).json({
      success: false,
      error: 'Referenced record not found.',
    });
  }

  // Default server error
  const isDev = process.env.NODE_ENV === 'development';
  return res.status(500).json({
    success: false,
    error: 'Internal server error',
    ...(isDev && { details: err.message, stack: err.stack }),
  });
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  });
}
