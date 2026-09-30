// src/services/kyc.service.ts
// Dawabag — KYC Verification Service
// Handles automated (API) + manual (admin) verification for all 4 customer types

import axios from 'axios';
import { pool } from '../config/database';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';
import { writeAudit } from '../utils/audit';
import { isBuyerType, requiredKycDocuments } from '../utils/customerType';
import { queueNotification } from './notification.service';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface GSTINVerificationResult {
  valid: boolean;
  legal_name?: string;
  trade_name?: string;
  status?: string;          // 'Active' | 'Cancelled' | 'Suspended'
  gst_type?: string;        // 'Regular' | 'Composition' | 'SEZ'
  state_code?: string;
  registration_date?: string;
  last_return_filed?: string;
  error?: string;
}

export interface PANVerificationResult {
  valid: boolean;
  name_as_per_pan?: string;
  name_match?: boolean;
  pan_status?: string;      // 'Active' | 'Inactive' | 'Fake'
  pan_type?: string;        // 'Individual' | 'Company' | 'Firm' | 'HUF'
  error?: string;
}

export interface DrugLicenseVerificationResult {
  verified: boolean;
  license_holder_name?: string;
  license_type?: string;    // 'DL-20' | 'DL-21' | 'DL-20B' | 'DL-21B'
  valid_upto?: string;
  premises_address?: string;
  is_expired?: boolean;
  notes?: string;
  verified_by_admin_id?: string;
}

export interface NMCVerificationResult {
  verified: boolean;
  doctor_name_as_per_register?: string;
  qualification?: string;
  council?: string;
  registration_date?: string;
  registration_status?: string;  // 'Active' | 'Suspended' | 'Cancelled'
  notes?: string;
  verified_by_admin_id?: string;
}

// ── GST API Integration (via Masters India or GSTN sandbox) ──────────────────
export class GSTINVerifier {
  private static readonly BASE_URL = process.env.GST_API_URL || 'https://api.mastersindia.co/api/v2';
  private static readonly API_KEY  = process.env.GST_API_KEY!;

  static async verify(gstin: string, userId: string): Promise<GSTINVerificationResult> {
    // Validate GSTIN format before API call
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstinRegex.test(gstin)) {
      return { valid: false, error: 'Invalid GSTIN format' };
    }

    try {
      const response = await axios.get(`${this.BASE_URL}/gstin/${gstin}`, {
        headers: { Authorization: `Bearer ${this.API_KEY}` },
        timeout: 10000,
      });

      const data = response.data;
      const result: GSTINVerificationResult = {
        valid: data.sts === 'Active',
        legal_name: data.lgnm,
        trade_name: data.tradeNam,
        status: data.sts,
        gst_type: data.dty,
        state_code: gstin.substring(0, 2),
        registration_date: data.rgdt,
        last_return_filed: data.lstupdt,
      };

      // Store verification result
      await KYCVerificationStore.save({
        user_id: userId,
        document_type: 'gstin',
        input_value: gstin,
        verification_method: 'api_gstn',
        result: result.valid ? 'verified' : 'failed',
        raw_response: JSON.stringify(data),
        verified_at: new Date(),
      });

      logger.info(`GSTIN verified: ${gstin} → ${result.valid ? 'ACTIVE' : 'FAILED'}`);
      return result;

    } catch (error: any) {
      logger.error(`GSTIN verification failed for ${gstin}:`, error.message);
      // Store failure
      await KYCVerificationStore.save({
        user_id: userId,
        document_type: 'gstin',
        input_value: gstin,
        verification_method: 'api_gstn',
        result: 'api_error',
        raw_response: JSON.stringify({ error: error.message }),
        verified_at: new Date(),
      });
      return { valid: false, error: 'GSTIN verification service unavailable. Admin will verify manually.' };
    }
  }
}

// ── PAN Verification (via Surepass or Protean eGov) ──────────────────────────
export class PANVerifier {
  private static readonly BASE_URL = process.env.PAN_API_URL || 'https://kyc-api.surepass.io/api/v1';
  private static readonly TOKEN    = process.env.PAN_API_TOKEN!;

  static async verify(panNumber: string, fullName: string, userId: string): Promise<PANVerificationResult> {
    // Validate PAN format
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (!panRegex.test(panNumber)) {
      return { valid: false, error: 'Invalid PAN format. Must be 10 characters e.g. ABCDE1234F' };
    }

    try {
      const response = await axios.post(`${this.BASE_URL}/pan/pan-comprehensive`,
        { id_number: panNumber, name: fullName, get_name: true },
        { headers: { Authorization: `Bearer ${this.TOKEN}` }, timeout: 10000 }
      );

      const data = response.data?.data;
      const nameFromPAN   = (data?.name || '').toLowerCase().trim();
      const nameEntered   = fullName.toLowerCase().trim();
      const nameMatch     = nameFromPAN.length > 0 &&
        (nameFromPAN.includes(nameEntered.split(' ')[0]) ||
         nameEntered.includes(nameFromPAN.split(' ')[0]));

      const result: PANVerificationResult = {
        valid: data?.pan_status === 'EXISTING AND VALID',
        name_as_per_pan: data?.name,
        name_match: nameMatch,
        pan_status: data?.pan_status,
        pan_type: data?.type,
      };

      await KYCVerificationStore.save({
        user_id: userId,
        document_type: 'pan',
        input_value: panNumber,
        verification_method: 'api_surepass',
        result: (result.valid && nameMatch) ? 'verified' : 'failed',
        raw_response: JSON.stringify(data),
        verified_at: new Date(),
      });

      logger.info(`PAN verified: ${panNumber} → ${result.valid ? 'VALID' : 'INVALID'}, Name match: ${nameMatch}`);
      return result;

    } catch (error: any) {
      logger.error(`PAN verification failed for ${panNumber}:`, error.message);
      await KYCVerificationStore.save({
        user_id: userId,
        document_type: 'pan',
        input_value: panNumber,
        verification_method: 'api_surepass',
        result: 'api_error',
        raw_response: JSON.stringify({ error: error.message }),
        verified_at: new Date(),
      });
      return { valid: false, error: 'PAN verification service unavailable. Admin will verify manually.' };
    }
  }
}

// ── Drug License — Manual Admin Verification ──────────────────────────────────
// No public API exists for state drug licensing authorities.
// Admin verifies manually on state FDA portal and records the result here.
export class DrugLicenseVerifier {
  // State → FDA portal URL mapping
  static readonly STATE_PORTAL_URLS: Record<string, string> = {
    'MH': 'https://fda.maharashtra.gov.in/fdadrugslicense.aspx',
    'KA': 'https://ahvs.karnataka.gov.in/',
    'GJ': 'https://fdca.gujarat.gov.in/',
    'TN': 'https://www.tnmsc.com/',
    'DL': 'https://www.delhi.gov.in/wps/wcm/connect/doit_health/Health',
    'AP': 'https://www.aptsdrugs.in/',
    'TS': 'https://drugcontrolts.telangana.gov.in/',
    'RJ': 'https://rajswasthya.nic.in/',
    'UP': 'https://updruglicensing.gov.in/',
    'WB': 'https://wbdrugs.gov.in/',
  };

  // Called by admin to record manual verification result
  static async recordAdminVerification(params: {
    userId: string;
    dlNumber: string;
    dlType: 'DL-20' | 'DL-21' | 'DL-20B' | 'DL-21B';
    verified: boolean;
    licenseHolderName?: string;
    validUpto?: string;
    premisesAddress?: string;
    rejectionReason?: string;
    adminId: string;
    notes?: string;
  }): Promise<void> {
    const { userId, dlNumber, dlType, verified, adminId } = params;

    await KYCVerificationStore.save({
      user_id: userId,
      document_type: `drug_license_${dlType.toLowerCase().replace('-', '')}`,
      input_value: dlNumber,
      verification_method: 'admin_manual',
      result: verified ? 'verified' : 'failed',
      raw_response: JSON.stringify({
        dl_number: dlNumber,
        dl_type: dlType,
        license_holder_name: params.licenseHolderName,
        valid_upto: params.validUpto,
        premises_address: params.premisesAddress,
        rejection_reason: params.rejectionReason,
        notes: params.notes,
      }),
      verified_at: new Date(),
      verified_by_admin_id: adminId,
    });

    // Record the licence result only. Approval is decided by
    // KYCOrchestrator.checkAndActivate once every required check has passed.
    await pool.query(`
      UPDATE users SET
        drug_license_verified = $1,
        drug_license_expiry = COALESCE($2::date, drug_license_expiry),
        drug_license_holder_name = COALESCE($5, drug_license_holder_name),
        kyc_status = CASE WHEN $1 = TRUE THEN kyc_status ELSE 'rejected' END,
        kyc_rejection_reason = CASE WHEN $1 = TRUE THEN kyc_rejection_reason ELSE $4 END,
        updated_at = NOW()
      WHERE id = $3
    `, [verified, params.validUpto || null, userId, params.rejectionReason || null, params.licenseHolderName || null]);

    // If rejected, notify user
    if (!verified) {
      await notifyUserKYCRejected(userId, 'drug_license', params.rejectionReason);
    }

    logger.info(`Drug License ${dlNumber} → admin ${adminId} → ${verified ? 'VERIFIED' : 'REJECTED'}`);
  }

  // Get the portal URL for a given state code (for admin panel)
  static getPortalUrl(stateCode: string): string {
    return this.STATE_PORTAL_URLS[stateCode.toUpperCase()] ||
      `https://www.google.com/search?q=drug+license+verification+${stateCode}+state+FDA`;
  }
}

// ── NMC Doctor Verification — Manual Admin ────────────────────────────────────
// NMC does not provide a public API. Admin manually checks nmc.org.in
// or the respective State Medical Council website.
export class NMCVerifier {
  static readonly NMC_PORTAL = 'https://www.nmc.org.in/information-desk/indian-medical-register/';
  static readonly STATE_COUNCIL_URLS: Record<string, string> = {
    'Maharashtra': 'https://www.mciindia.org/CMS/information-desk/for-doctors-by-state/maharashtra-medical-council',
    'Karnataka':   'https://kmc.gov.in/',
    'Gujarat':     'https://gmc.gujarat.gov.in/',
    'Tamil Nadu':  'https://www.tnmgr.ac.in/',
    'Delhi':       'https://www.dmc.in/',
    'Andhra Pradesh': 'https://apmc.ap.gov.in/',
    'Rajasthan':   'https://rmc.rajasthan.gov.in/',
    'Uttar Pradesh': 'https://upmc.in/',
  };

  static async recordAdminVerification(params: {
    userId: string;
    nmcNumber: string;
    councilState: string;
    verified: boolean;
    doctorNameAsPerRegister?: string;
    qualification?: string;
    registrationDate?: string;
    registrationStatus?: string;
    rejectionReason?: string;
    adminId: string;
    notes?: string;
  }): Promise<void> {
    const { userId, nmcNumber, verified, adminId } = params;

    await KYCVerificationStore.save({
      user_id: userId,
      document_type: 'nmc_registration',
      input_value: nmcNumber,
      verification_method: 'admin_manual_nmc',
      result: verified ? 'verified' : 'failed',
      raw_response: JSON.stringify({
        nmc_number: nmcNumber,
        council_state: params.councilState,
        doctor_name_as_per_register: params.doctorNameAsPerRegister,
        qualification: params.qualification,
        registration_date: params.registrationDate,
        registration_status: params.registrationStatus,
        rejection_reason: params.rejectionReason,
        notes: params.notes,
      }),
      verified_at: new Date(),
      verified_by_admin_id: adminId,
    });

    // Approval is decided by KYCOrchestrator.checkAndActivate (needs PAN too)
    await pool.query(`
      UPDATE users SET
        nmc_reg_verified = $1,
        nmc_doctor_name_as_per_register = COALESCE($4, nmc_doctor_name_as_per_register),
        kyc_status = CASE WHEN $1 = TRUE THEN kyc_status ELSE 'rejected' END,
        kyc_rejection_reason = CASE WHEN $1 = TRUE THEN kyc_rejection_reason ELSE $3 END,
        updated_at = NOW()
      WHERE id = $2
    `, [verified, userId, params.rejectionReason || null, params.doctorNameAsPerRegister || null]);

    if (!verified) {
      await notifyUserKYCRejected(userId, 'nmc_registration', params.rejectionReason);
    }

    logger.info(`NMC ${nmcNumber} → admin ${adminId} → ${verified ? 'VERIFIED' : 'REJECTED'}`);
  }

  static getPortalUrl(councilState?: string): string {
    if (councilState && this.STATE_COUNCIL_URLS[councilState]) {
      return this.STATE_COUNCIL_URLS[councilState];
    }
    return this.NMC_PORTAL;
  }
}

// ── KYC Orchestrator — runs all checks when user submits ─────────────────────
export class KYCOrchestrator {
  // Called immediately when B2B Retailer submits signup
  static async processB2BRetailer(userId: string, params: {
    gstin?: string;          // Optional — may not have GST
    pan: string;
    fullName: string;
    dlNumber: string;
    dlType: 'DL-20' | 'DL-21';
    stateCode: string;
  }): Promise<{ autoChecksPassed: boolean; message: string; pendingManual: string[] }> {
    const pendingManual: string[] = [];
    let autoChecksPassed = true;

    // 1. GST check — only if GSTIN provided
    if (params.gstin) {
      const gstResult = await GSTINVerifier.verify(params.gstin, userId);
      if (!gstResult.valid) {
        await pool.query(`UPDATE users SET kyc_status = 'rejected', kyc_rejection_reason = $1 WHERE id = $2`,
          [`GSTIN verification failed: ${gstResult.error || gstResult.status}`, userId]);
        return { autoChecksPassed: false, message: `GSTIN ${params.gstin} is ${gstResult.status || 'invalid'}. Please check and resubmit.`, pendingManual: [] };
      }
    }

    // 2. PAN check — always required
    const panResult = await PANVerifier.verify(params.pan, params.fullName, userId);
    if (!panResult.valid) {
      await pool.query(`UPDATE users SET kyc_status = 'rejected', kyc_rejection_reason = $1 WHERE id = $2`,
        [`PAN verification failed: ${panResult.error || panResult.pan_status}`, userId]);
      return { autoChecksPassed: false, message: `PAN ${params.pan} is ${panResult.pan_status || 'invalid'}.`, pendingManual: [] };
    }
    if (!panResult.name_match) {
      // Name mismatch — flag for admin review rather than hard block
      await KYCVerificationStore.save({ user_id: userId, document_type: 'pan_name_mismatch', input_value: params.pan,
        verification_method: 'api_surepass', result: 'pending_admin',
        raw_response: JSON.stringify({ entered_name: params.fullName, pan_name: panResult.name_as_per_pan }),
        verified_at: new Date() });
      pendingManual.push('PAN name mismatch — admin verification needed');
    }

    // 3. Drug License — always manual
    pendingManual.push('drug_license');
    await pool.query(`UPDATE users SET kyc_status = 'pending_kyc', updated_at = NOW() WHERE id = $1`, [userId]);

    // Notify admin team
    await notifyAdminNewKYC(userId, 'b2b_retailer', params.dlNumber, DrugLicenseVerifier.getPortalUrl(params.stateCode));

    return {
      autoChecksPassed: true,
      message: 'Automatic checks passed. Drug License verification by our team within 1–2 working days.',
      pendingManual,
    };
  }

  // Called immediately when B2B Wholesaler submits signup
  static async processB2BWholesaler(userId: string, params: {
    gstin: string;
    pan: string;
    companyName: string;
    dlNumber: string;
    dlType: 'DL-20B' | 'DL-21B';
    stateCode: string;
  }): Promise<{ autoChecksPassed: boolean; message: string; pendingManual: string[] }> {
    const pendingManual: string[] = [];

    // GSTIN mandatory for wholesalers
    const gstResult = await GSTINVerifier.verify(params.gstin, userId);
    if (!gstResult.valid) {
      return { autoChecksPassed: false, message: `GSTIN ${params.gstin} is not active. Wholesale accounts require active GST registration.`, pendingManual: [] };
    }
    if (gstResult.gst_type === 'Composition') {
      return { autoChecksPassed: false, message: 'Composition scheme GST registrations are not eligible for wholesale accounts. Please contact support.', pendingManual: [] };
    }

    // PAN — company PAN check
    const panResult = await PANVerifier.verify(params.pan, params.companyName, userId);
    if (!panResult.valid) {
      return { autoChecksPassed: false, message: `PAN ${params.pan} verification failed.`, pendingManual: [] };
    }
    if (panResult.pan_type === 'Individual') {
      pendingManual.push('PAN type is Individual — expected Company/Firm for wholesale account');
    }

    // Wholesale DL + cancelled cheque → manual
    pendingManual.push('wholesale_drug_license', 'cancelled_cheque');
    await pool.query(`UPDATE users SET kyc_status = 'pending_kyc', updated_at = NOW() WHERE id = $1`, [userId]);
    await notifyAdminNewKYC(userId, 'b2b_wholesaler', params.dlNumber, DrugLicenseVerifier.getPortalUrl(params.stateCode));

    return {
      autoChecksPassed: true,
      message: 'Automatic checks passed. Drug License and bank account verification within 2–3 working days.',
      pendingManual,
    };
  }

  // Called when Type 4 Doctor submits signup
  static async processDoctor(userId: string, params: {
    pan: string;
    doctorName: string;
    nmcNumber: string;
    councilState: string;
  }): Promise<{ autoChecksPassed: boolean; message: string; pendingManual: string[] }> {
    const pendingManual: string[] = [];

    // PAN — Individual PAN required
    const panResult = await PANVerifier.verify(params.pan, params.doctorName, userId);
    if (!panResult.valid) {
      return { autoChecksPassed: false, message: `PAN ${params.pan} verification failed.`, pendingManual: [] };
    }
    if (panResult.pan_type !== 'Individual') {
      return { autoChecksPassed: false, message: 'Doctors must register with an Individual PAN. Company/Firm PANs are not accepted for Type 4 accounts.', pendingManual: [] };
    }

    // NMC always manual — send to admin queue
    pendingManual.push('nmc_registration');
    await pool.query(`UPDATE users SET kyc_status = 'pending_kyc', updated_at = NOW() WHERE id = $1`, [userId]);
    await notifyAdminNewKYC(userId, 'doc_hospital', params.nmcNumber, NMCVerifier.getPortalUrl(params.councilState));

    return {
      autoChecksPassed: true,
      message: 'PAN verified automatically. NMC registration verification by our team within 1–2 working days.',
      pendingManual,
    };
  }

  // Verification checks each buyer type needs before activation (URS v3.1 §3)
  static requiredChecks(user: { customer_type: string; drug_license_type: string | null; gstin: string | null }): string[] {
    const dl = user.drug_license_type ? `drug_license_${user.drug_license_type}` : 'drug_license';
    switch (user.customer_type) {
      case 'b2b_retailer':   return user.gstin ? ['pan', dl, 'gstin'] : ['pan', dl];
      case 'b2b_wholesaler': return ['pan', dl, 'gstin'];
      case 'doc_hospital':   return ['pan', 'nmc_registration'];
      default:               return [];
    }
  }

  // Current state of every check, for the admin review screen and activation
  static async checkStatus(userId: string) {
    const user = (await pool.query(
      `SELECT id, customer_type, kyc_status, drug_license_type, drug_license_expiry, gstin
       FROM users WHERE id = $1`, [userId])).rows[0];
    if (!user) return null;
    const rows = (await pool.query(
      `SELECT document_type, result, verification_method, verified_at
       FROM kyc_verifications WHERE user_id = $1`, [userId])).rows;
    const byType = Object.fromEntries(rows.map((r: any) => [r.document_type, r]));
    const checks = this.requiredChecks(user).map((type) => ({
      check: type,
      result: byType[type]?.result ?? 'pending',
      method: byType[type]?.verification_method ?? null,
      verified_at: byType[type]?.verified_at ?? null,
    }));
    const type = isBuyerType(user.customer_type) ? user.customer_type : 'customer';
    const docs = (await pool.query('SELECT document_type FROM kyc_documents WHERE user_id = $1', [userId]))
      .rows.map((r: any) => r.document_type);
    const missingDocuments = requiredKycDocuments(type, !!user.gstin).filter((d) => !docs.includes(d));
    const licenceExpired = !!user.drug_license_expiry && new Date(user.drug_license_expiry) < startOfToday();
    return { user, checks, missingDocuments, licenceExpired };
  }

  // Activates the account when every required check has passed, all required
  // documents are uploaded and the drug licence (if any) has not expired.
  static async checkAndActivate(userId: string, adminId?: string): Promise<boolean> {
    const state = await this.checkStatus(userId);
    if (!state || state.checks.length === 0) return false;
    if (!['pending_kyc', 'pending_renewal', 'flagged_gstin', 'rejected'].includes(state.user.kyc_status)) return false;

    const allPassed = state.checks.every((c) => c.result === 'verified')
      && state.missingDocuments.length === 0
      && !state.licenceExpired;
    if (!allPassed) return false;

    await pool.query(`
      UPDATE users SET
        kyc_status = 'approved',
        kyc_approved_at = NOW(),
        kyc_rejection_reason = NULL,
        updated_at = NOW()
      WHERE id = $1
    `, [userId]);
    await writeAudit({
      userId, action: 'kyc_approved', performedBy: adminId ?? null,
      oldValue: { kyc_status: state.user.kyc_status },
      newValue: { kyc_status: 'approved', checks: state.checks.map((c) => c.check) },
    });
    await notifyUserAccountActivated(userId);
    logger.info(`Account activated: ${userId}`);
    return true;
  }

  // Admin rejects the whole application with a reason the buyer will see
  static async rejectApplication(userId: string, reason: string, adminId: string): Promise<void> {
    const before = (await pool.query('SELECT kyc_status FROM users WHERE id = $1', [userId])).rows[0];
    if (!before) throw new AppError('User not found', 404);
    await pool.query(
      `UPDATE users SET kyc_status = 'rejected', kyc_rejection_reason = $2, updated_at = NOW() WHERE id = $1`,
      [userId, reason]
    );
    await writeAudit({
      userId, action: 'kyc_rejected', performedBy: adminId,
      oldValue: { kyc_status: before.kyc_status }, newValue: { kyc_status: 'rejected' }, notes: reason,
    });
    await notifyUserKYCRejected(userId, 'application', reason);
  }
}

// Manual PAN / GSTIN check by an admin — used when the Surepass / GSTN APIs
// are not configured or return an error.
export class IdentityVerifier {
  static async recordAdminVerification(params: {
    userId: string;
    documentType: 'pan' | 'gstin';
    verified: boolean;
    rejectionReason?: string;
    notes?: string;
    adminId: string;
  }): Promise<void> {
    const user = (await pool.query('SELECT pan_number, gstin FROM users WHERE id = $1', [params.userId])).rows[0];
    if (!user) throw new AppError('User not found', 404);
    const value = params.documentType === 'pan' ? user.pan_number : user.gstin;
    if (!value) throw new AppError(`No ${params.documentType.toUpperCase()} on this account`, 400);

    await KYCVerificationStore.save({
      user_id: params.userId,
      document_type: params.documentType,
      input_value: value,
      verification_method: 'admin_manual',
      result: params.verified ? 'verified' : 'failed',
      raw_response: JSON.stringify({ rejection_reason: params.rejectionReason, notes: params.notes }),
      verified_at: new Date(),
      verified_by_admin_id: params.adminId,
    });
    await pool.query(
      `UPDATE users SET
         ${params.documentType === 'pan' ? 'pan_verified' : 'gstin_verified'} = $2,
         kyc_status = CASE WHEN $2 = TRUE THEN kyc_status ELSE 'rejected' END,
         kyc_rejection_reason = CASE WHEN $2 = TRUE THEN kyc_rejection_reason ELSE $3 END,
         updated_at = NOW()
       WHERE id = $1`,
      [params.userId, params.verified, params.rejectionReason || null]
    );
    if (!params.verified) await notifyUserKYCRejected(params.userId, params.documentType, params.rejectionReason);
  }
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── KYC Verification Store ────────────────────────────────────────────────────
export class KYCVerificationStore {
  static async save(data: {
    user_id: string;
    document_type: string;
    input_value: string;
    verification_method: string;
    result: string;
    raw_response: string;
    verified_at: Date;
    verified_by_admin_id?: string;
  }): Promise<void> {
    await pool.query(`
      INSERT INTO kyc_verifications
        (user_id, document_type, input_value, verification_method, result, raw_response, verified_at, verified_by_admin_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (user_id, document_type)
      DO UPDATE SET
        result = EXCLUDED.result,
        raw_response = EXCLUDED.raw_response,
        verified_at = EXCLUDED.verified_at,
        verified_by_admin_id = EXCLUDED.verified_by_admin_id
    `, [
      data.user_id, data.document_type, data.input_value,
      data.verification_method, data.result, data.raw_response,
      data.verified_at, data.verified_by_admin_id || null
    ]);
  }
}

// ── Scheduled: drug licence expiry (daily, Rulebook C-14) ─────────────────────
// Warns 60 and 30 days ahead and on the last 7 days; blocks trade ordering from
// the expiry date by moving the account to 'pending_renewal'.
export async function runDailyLicenceExpiryCheck(): Promise<{ warned: number; blocked: number }> {
  const warn = await pool.query(`
    SELECT id, drug_license_expiry, (drug_license_expiry - CURRENT_DATE) AS days_left
    FROM users
    WHERE customer_type IN ('b2b_retailer', 'b2b_wholesaler')
      AND kyc_status = 'approved'
      AND drug_license_expiry IS NOT NULL
      AND (drug_license_expiry - CURRENT_DATE) IN (60, 30, 7, 6, 5, 4, 3, 2, 1)
  `);
  for (const u of warn.rows) {
    await queueNotification({
      userId: u.id, type: 'licence_expiring',
      expiryDate: formatDate(u.drug_license_expiry), daysLeft: u.days_left,
    });
  }

  const expired = await pool.query(`
    UPDATE users SET kyc_status = 'pending_renewal', updated_at = NOW()
    WHERE customer_type IN ('b2b_retailer', 'b2b_wholesaler')
      AND kyc_status = 'approved'
      AND drug_license_expiry IS NOT NULL
      AND drug_license_expiry < CURRENT_DATE
    RETURNING id, drug_license_expiry
  `);
  for (const u of expired.rows) {
    await writeAudit({
      userId: u.id, action: 'licence_expired_blocked',
      oldValue: { kyc_status: 'approved' }, newValue: { kyc_status: 'pending_renewal' },
      notes: `Drug licence expired ${formatDate(u.drug_license_expiry)}`,
    });
    await queueNotification({ userId: u.id, type: 'licence_expired' });
  }

  logger.info(`Licence expiry check: ${warn.rowCount} warned, ${expired.rowCount} blocked`);
  return { warned: warn.rowCount ?? 0, blocked: expired.rowCount ?? 0 };
}

// ── Scheduled: GSTIN re-verification (monthly, Rulebook C-14) ────────────────
// Needs GST_API_URL / GST_API_KEY; without them it skips rather than flagging
// every account.
export async function runMonthlyReVerification(): Promise<{ checked: number; flagged: number; skipped?: string }> {
  if (!process.env.GST_API_URL || !process.env.GST_API_KEY) {
    logger.warn('GSTIN re-verification skipped: GST_API_URL / GST_API_KEY not set');
    return { checked: 0, flagged: 0, skipped: 'GST API not configured' };
  }

  const b2bAccounts = await pool.query(`
    SELECT id, gstin FROM users
    WHERE customer_type IN ('b2b_retailer', 'b2b_wholesaler')
      AND gstin IS NOT NULL AND gstin != ''
      AND kyc_status = 'approved'
  `);
  let flagged = 0;
  for (const user of b2bAccounts.rows) {
    const result = await GSTINVerifier.verify(user.gstin, user.id);
    if (!result.valid || result.status !== 'Active') {
      flagged++;
      await pool.query(`
        UPDATE users SET kyc_status = 'flagged_gstin', updated_at = NOW() WHERE id = $1
      `, [user.id]);
      await writeAudit({
        userId: user.id, action: 'gstin_flagged',
        oldValue: { kyc_status: 'approved' }, newValue: { kyc_status: 'flagged_gstin', gstn_status: result.status },
      });
      logger.warn(`GSTIN flagged for user ${user.id}: status = ${result.status}`);
    }
    // Rate limit: 1 second between GSTN API calls
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  logger.info('Monthly GSTIN re-verification complete');
  return { checked: b2bAccounts.rowCount ?? 0, flagged };
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Notifications ─────────────────────────────────────────────────────────────
async function notifyUserKYCRejected(userId: string, docType: string, reason?: string): Promise<void> {
  await queueNotification({ userId, type: 'kyc_rejected', reason, docType });
}

async function notifyAdminNewKYC(userId: string, customerType: string, docNumber: string, portalUrl: string): Promise<void> {
  // Admins work from the KYC queue in the admin panel; no push channel yet
  logger.info(`New KYC queued for admin review: user ${userId} (${customerType}), doc: ${docNumber}`);
}

async function notifyUserAccountActivated(userId: string): Promise<void> {
  await queueNotification({ userId, type: 'kyc_approved' });
}
