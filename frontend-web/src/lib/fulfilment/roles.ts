// Who sees which fulfilment stage — mirrors STAGE_ROLES on the server.
import type { QueueStage } from './types';

export const FULFILMENT_ROLES = ['pharmacist_rx', 'pharmacist_pack', 'delivery', 'admin', 'super_admin'] as const;

export const STAGE_ROLES: Record<QueueStage | 'h1', readonly string[]> = {
  rx: ['pharmacist_rx'],
  pack: ['pharmacist_pack', 'admin', 'super_admin'],
  dispatch: ['pharmacist_pack', 'admin', 'super_admin'],
  deliver: ['delivery', 'admin', 'super_admin'],
  h1: ['pharmacist_rx', 'admin', 'super_admin'],
};

/** Today in India as YYYY-MM-DD */
export function todayIST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** YYYY-MM-DD `days` before today (IST) */
export function daysAgoIST(days: number): string {
  return new Date(Date.now() - days * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
