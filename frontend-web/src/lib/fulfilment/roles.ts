// Who sees which fulfilment stage — mirrors STAGE_ROLES on the server.
import type { QueueStage } from './types';

export const FULFILMENT_ROLES = ['pharmacist_rx', 'pharmacist_pack', 'delivery', 'admin', 'super_admin'] as const;

/** Dawabag's own riders (Sprint 13): they work from their run sheet, never the order (C-41) */
export const RIDER_ROLES = ['delivery'] as const;
/** Fulfilment tabs (Rx / pack / dispatch / deliver queues) — everyone in the staff area but riders */
export const FULFILMENT_QUEUE_ROLES = FULFILMENT_ROLES.filter((r) => r !== 'delivery');

/** Where a staff role lands after sign-in */
export function staffHome(role: string | undefined): string {
  return role === 'delivery' ? '/staff/run-sheet' : '/staff/fulfilment';
}

export const STAGE_ROLES: Record<QueueStage | 'h1', readonly string[]> = {
  rx: ['pharmacist_rx'],
  check: ['pharmacist_rx'],   // Sprint 35: every order's pharmacist check (prescriptions included)
  pack: ['pharmacist_pack', 'admin', 'super_admin'],
  dispatch: ['pharmacist_pack', 'admin', 'super_admin'],
  deliver: ['delivery', 'pharmacist_pack', 'admin', 'super_admin'],   // packers: to reassign riders

  h1: ['pharmacist_rx', 'admin', 'super_admin'],
};
