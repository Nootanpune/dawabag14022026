// Who may do what in purchasing and stock control — mirrors
// backend/src/routes/purchasing.routes.ts and stockControl.routes.ts.
/** receiving, batches, adjustment requests, destruction, counts */
export const STORE_ROLES = ['admin', 'super_admin', 'pharmacist_pack', 'pharmacist_rx'] as const;
/** suppliers, purchase orders, adjustment / count approvals */
export const PURCHASE_ADMIN_ROLES = ['admin', 'super_admin'] as const;
/** receiving goods with no purchase order — no second person behind the purchase (C-46) */
export const RECEIVE_WITHOUT_PO_ROLES = ['admin', 'super_admin'] as const;
