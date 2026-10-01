import { istMonth, istYear } from './ist';
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function generateOrderNumber(): string {
  const year = String(istYear()).slice(-2);           // order numbers carry the Indian month
  const month = String(istMonth()).padStart(2, '0');
  const random = Math.floor(10000 + Math.random() * 90000);
  return `DWB-${year}${month}-${random}`;
}
