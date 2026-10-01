// src/controllers/kyc.controller.ts
// Dawabag — KYC Verification Controller
// Routes: /api/v1/kyc/*

import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/database';
import {
  KYCOrchestrator, GSTINVerifier, PANVerifier,
  DrugLicenseVerifier, NMCVerifier
} from '../services/kyc.service';
import { AppError } from '../utils/AppError';
import { writeAudit } from '../utils/audit';
import { logger } from '../config/logger';

// ── Auto-verify GSTIN (called at signup) ─────────────────────────────────────
export const verifyGSTIN = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { gstin, user_id } = req.body;
    if (!gstin || !user_id) throw new AppError('gstin and user_id required', 400);

    const result = await GSTINVerifier.verify(gstin.toUpperCase().trim(), user_id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// ── Auto-verify PAN (called at signup) ───────────────────────────────────────
export const verifyPAN = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pan_number, full_name, user_id } = req.body;
    if (!pan_number || !full_name || !user_id) throw new AppError('pan_number, full_name and user_id required', 400);

    const result = await PANVerifier.verify(pan_number.toUpperCase().trim(), full_name, user_id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// ── Get KYC status for a user ─────────────────────────────────────────────────
export const getKYCStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.userId;
    // Only the user themselves or an admin can view
    if (req.user!.id !== userId && !['admin','super_admin'].includes(req.user!.role)) {
      throw new AppError('Forbidden', 403);
    }

    const userResult = await pool.query(
      `SELECT kyc_status, kyc_submitted_at, kyc_approved_at, kyc_rejection_reason,
              gstin_verified, pan_verified, drug_license_verified, nmc_reg_verified
       FROM users WHERE id = $1`, [userId]
    );
    const verifications = await pool.query(
      `SELECT document_type, result, verified_at, verified_by_admin_id
       FROM kyc_verifications WHERE user_id = $1 ORDER BY verified_at DESC`, [userId]
    );

    res.json({
      success: true,
      data: {
        ...userResult.rows[0],
        verification_details: verifications.rows,
      }
    });
  } catch (err) { next(err); }
};

// ── ADMIN: Get KYC queue ──────────────────────────────────────────────────────
export const getKYCQueue = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customer_type, status } = req.query;
    let query = 'SELECT * FROM admin_kyc_queue';
    const params: any[] = [];

    if (customer_type) {
      params.push(customer_type);
      query += ` WHERE customer_type = $${params.length}`;
    }

    query += ' ORDER BY registered_at ASC LIMIT 50';
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
};

// ── ADMIN: Verify Drug License ────────────────────────────────────────────────
export const adminVerifyDrugLicense = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      user_id, dl_number, dl_type, verified,
      license_holder_name, valid_upto, premises_address,
      rejection_reason, notes
    } = req.body;

    if (!user_id || !dl_number || !dl_type || verified === undefined) {
      throw new AppError('user_id, dl_number, dl_type, and verified (boolean) are required', 400);
    }

    if (!['DL-20','DL-21','DL-20B','DL-21B'].includes(dl_type)) {
      throw new AppError('dl_type must be DL-20, DL-21, DL-20B, or DL-21B', 400);
    }

    if (!verified && !rejection_reason) {
      throw new AppError('rejection_reason is required when verified = false', 400);
    }

    await DrugLicenseVerifier.recordAdminVerification({
      userId: user_id,
      dlNumber: dl_number,
      dlType: dl_type,
      verified,
      licenseHolderName: license_holder_name,
      validUpto: valid_upto,
      premisesAddress: premises_address,
      rejectionReason: rejection_reason,
      adminId: req.user!.id,
      notes,
    });

    // Check if all verifications complete → activate account
    await writeAudit({
      userId: user_id, action: verified ? 'kyc_check_verified' : 'kyc_check_failed',
      performedBy: req.user!.id, newValue: { check: 'drug_license' }, notes: rejection_reason ?? notes,
    });
    const activated = verified ? await KYCOrchestrator.checkAndActivate(user_id, req.user!.id) : false;

    res.json({
      success: true,
      data: {
        verified,
        account_activated: activated,
        message: activated
          ? 'Drug License verified. All checks passed. Account is now ACTIVE.'
          : verified
          ? 'Drug License verified. Other verifications still pending.'
          : `Drug License rejected. User notified with reason: ${rejection_reason}`,
      }
    });
  } catch (err) { next(err); }
};

// ── ADMIN: Verify NMC Registration ────────────────────────────────────────────
export const adminVerifyNMC = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      user_id, nmc_number, council_state, verified,
      doctor_name_as_per_register, qualification,
      registration_date, registration_status,
      rejection_reason, notes
    } = req.body;

    if (!user_id || !nmc_number || !council_state || verified === undefined) {
      throw new AppError('user_id, nmc_number, council_state, and verified are required', 400);
    }
    if (!verified && !rejection_reason) {
      throw new AppError('rejection_reason required when verified = false', 400);
    }

    await NMCVerifier.recordAdminVerification({
      userId: user_id,
      nmcNumber: nmc_number,
      councilState: council_state,
      verified,
      doctorNameAsPerRegister: doctor_name_as_per_register,
      qualification,
      registrationDate: registration_date,
      registrationStatus: registration_status,
      rejectionReason: rejection_reason,
      adminId: req.user!.id,
      notes,
    });

    await writeAudit({
      userId: user_id, action: verified ? 'kyc_check_verified' : 'kyc_check_failed',
      performedBy: req.user!.id, newValue: { check: 'nmc_registration' }, notes: rejection_reason ?? notes,
    });
    const activated = verified ? await KYCOrchestrator.checkAndActivate(user_id, req.user!.id) : false;

    res.json({
      success: true,
      data: {
        verified,
        account_activated: activated,
        message: activated
          ? 'NMC verified. All checks passed. Doctor account is now ACTIVE.'
          : verified
          ? 'NMC verified. Other verifications pending.'
          : `NMC rejected. User notified.`,
      }
    });
  } catch (err) { next(err); }
};

// ── ADMIN: Get portal links for manual verification ───────────────────────────
export const getVerificationPortalLinks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id } = req.params;
    const userResult = await pool.query(
      'SELECT customer_type, nmc_council_state, mobile FROM users WHERE id = $1', [user_id]
    );
    const user = userResult.rows[0];
    if (!user) throw new AppError('User not found', 404);

    // Extract state code from mobile or address (simplified — use first 2 digits of drug license)
    const links: Record<string, string> = {
      nmc_portal: NMCVerifier.NMC_PORTAL,
      pan_check: 'https://eportal.incometax.gov.in/iec/foservices/#/pre-login/knowYourPan',
      gst_check: 'https://www.gst.gov.in/commonhome',
    };

    if (user.customer_type === 'doc_hospital' && user.nmc_council_state) {
      links.state_medical_council = NMCVerifier.getPortalUrl(user.nmc_council_state);
    }

    // Add state FDA portal links
    const stateFDALinks: Record<string, string> = {
      Maharashtra: 'https://fda.maharashtra.gov.in/fdadrugslicense.aspx',
      Karnataka:   'https://ahvs.karnataka.gov.in/drugLicensePublic/',
      Gujarat:     'https://fdca.gujarat.gov.in/DrugLicenseVerify.aspx',
      Delhi:       'https://food.delhi.gov.in/food/citizen/DrugLicVerify.aspx',
    };
    links.state_fda_links = JSON.stringify(stateFDALinks);
    links.cdsco_national = 'https://www.cdsco.gov.in/opencms/opencms/en/DrugLicence/';

    res.json({ success: true, data: { user_id, customer_type: user.customer_type, portal_links: links } });
  } catch (err) { next(err); }
};

// ── ADMIN: Upgrade doc_hospital → b2b_retailer ───────────────────────────────
export const upgradeDocToRetailer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user_id, new_gstin, drug_license_number, drug_license_type, notes } = req.body;
    if (!user_id || !drug_license_number || !drug_license_type) {
      throw new AppError('user_id, drug_license_number, and drug_license_type are required', 400);
    }

    // Check user is currently doc_hospital
    const userResult = await pool.query('SELECT customer_type FROM users WHERE id = $1', [user_id]);
    const user = userResult.rows[0];
    if (!user) throw new AppError('User not found', 404);
    if (user.customer_type !== 'doc_hospital') {
      throw new AppError(`Cannot upgrade — user is already ${user.customer_type}, not doc_hospital`, 400);
    }

    // Verify new GSTIN if provided
    if (new_gstin) {
      const gstResult = await GSTINVerifier.verify(new_gstin, user_id);
      if (!gstResult.valid) {
        throw new AppError(`New GSTIN ${new_gstin} is not active: ${gstResult.status}`, 400);
      }
    }

    // Upgrade the account in a transaction
    await pool.query('BEGIN');
    try {
      await pool.query(`
        UPDATE users SET
          customer_type         = 'b2b_retailer',
          gstin                 = COALESCE($1, gstin),
          gstin_verified        = CASE WHEN $1 IS NOT NULL THEN TRUE ELSE FALSE END,
          drug_license_number   = $2,
          drug_license_type     = $3,
          drug_license_verified = FALSE,  -- needs admin to verify new DL
          kyc_status            = 'pending_kyc',  -- re-enter KYC for DL
          account_upgrade_at    = NOW(),
          account_upgrade_from  = 'doc_hospital',
          account_upgrade_by    = $4,
          updated_at            = NOW()
        WHERE id = $5
      `, [new_gstin || null, drug_license_number, drug_license_type, req.user!.id, user_id]);

      // Log in audit_log
      await pool.query(`
        INSERT INTO audit_logs (user_id, action, old_value, new_value, performed_by, notes)
        VALUES ($1, 'account_type_upgrade', 'doc_hospital', 'b2b_retailer', $2, $3)
      `, [user_id, req.user!.id, notes || '']);

      await pool.query('COMMIT');

      logger.info(`Account upgraded: user ${user_id} from doc_hospital to b2b_retailer by admin ${req.user!.id}`);
      res.json({
        success: true,
        data: {
          message: 'Account upgraded to B2B Retailer. Drug License verification required. Admin KYC queue updated.',
          user_id,
          new_type: 'b2b_retailer',
          next_step: 'Verify the new drug license via state FDA portal and approve.',
        }
      });
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  } catch (err) { next(err); }
};
