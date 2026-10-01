// Roles for teleconsultation screens — mirror backend/src/routes/doctor.routes.ts and consultation.routes.ts.
export const DOCTOR_ROLES = ['doctor'] as const;
/** enable doctor logins and check registrations (C-22) */
export const DOCTOR_ADMIN_ROLES = ['admin', 'super_admin'] as const;
/** set a medicine's telemedicine list (C-23) */
export const TELE_LIST_ROLES = ['pharmacist_rx', 'admin', 'super_admin'] as const;
