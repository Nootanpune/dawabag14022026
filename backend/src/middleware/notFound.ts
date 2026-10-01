import { Request, Response } from 'express';

export function notFound(req: Request, res: Response) {
  const message = `Route ${req.method} ${req.path} not found`;
  res.status(404).json({ success: false, message, error: message });
}
