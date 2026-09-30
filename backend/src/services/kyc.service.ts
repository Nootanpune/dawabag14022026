// src/services/kyc.service.ts
// Dawabag — KYC Verification Service
// Handles automated (API) + manual (admin) verification for all 4 customer types

import axios from 'axios';
import { pool } from '../config/database';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';

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
  license_type?: string;    // 'DL-20' | 'DL-21' | 'DL-20C' | 'DL-21C'
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
    dlType: 'DL-20' | 'DL-21' | 'DL-20C' | 'DL-21C';
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

    // Update user's drug license fields
    await pool.query(`
      UPDATE users SET
        drug_license_verified = $1,
        drug_license_expiry = $2,
        kyc_status = CASE
          WHEN $1 = TRUE THEN
            CASE WHEN (SELECT COUNT(*) FROM kyc_verifications
                       WHERE user_id = $3 AND result = 'verified') >= 2
              THEN 'approved' ELSE kyc_status END
          ELSE 'rejected'
        END,
        kyc_rejection_reason = $4,
        updated_at = NOW()
      WHERE id = $3
    `, [verified, params.validUpto, userId, params.rejectionReason]);

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

    await pool.query(`
      UPDATE users SET
        nmc_reg_verified = $1,
        kyc_status = CASE
          WHEN $1 = TRUE THEN
            CASE WHEN (SELECT COUNT(*) FROM kyc_verifications
                       WHERE user_id = $2 AND result = 'verified') >= 1
              THEN 'approved' ELSE kyc_status END
          ELSE 'rejected'
        END,
        kyc_rejection_reason = $3,
        updated_at = NOW()
      WHERE id = $2
    `, [verified, userId, params.rejectionReason]);

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
    dlType: 'DL-20C' | 'DL-21C';
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

  // Checks if all required verifications are complete → activates account
  static async checkAndActivate(userId: string): Promise<boolean> {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    if (!user) return false;

    const verifResult = await pool.query(
      `SELECT document_type, result FROM kyc_verifications WHERE user_id = $1 ORDER BY verified_at DESC`,
      [userId]
    );
    const verifs = verifResult.rows.reduce((acc: Record<string, string>, row: any) => {
      if (!acc[row.document_type]) acc[row.document_type] = row.result;
      return acc;
    }, {});

    let allPassed = false;

    if (user.customer_type === 'b2b_retailer') {
      const dlKey = user.drug_license_type === 'dl20' ? 'drug_license_dl20' : 'drug_license_dl21';
      const panOk = verifs['pan'] === 'verified';
      const dlOk  = verifs[dlKey] === 'verified';
      const gstOk = user.gstin ? verifs['gstin'] === 'verified' : true; // GST optional
      allPassed = panOk && dlOk && gstOk;
    }

    if (user.customer_type === 'b2b_wholesaler') {
      allPassed = verifs['gstin'] === 'verified' &&
                  verifs['pan']   === 'verified' &&
                  verifs['drug_license_dl20c'] === 'verified';
    }

    if (user.customer_type === 'doc_hospital') {
      allPassed = verifs['pan']              === 'verified' &&
                  verifs['nmc_registration'] === 'verified';
    }

    if (allPassed) {
      await pool.query(`
        UPDATE users SET
          kyc_status = 'approved',
          kyc_approved_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
      `, [userId]);
      await notifyUserAccountActivated(userId);
      logger.info(`Account activated: ${userId}`);
    }

    return allPassed;
  }
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

// ── Re-verification scheduler (called by cron job monthly) ───────────────────
export async function runMonthlyReVerification(): Promise<void> {
  logger.info('Running monthly KYC re-verification...');

  // 1. Check for expired drug licenses (60-day advance alert)
  const expiringDLs = await pool.query(`
    SELECT id, full_name, mobile, drug_license_number, drug_license_expiry
    FROM users
    WHERE customer_type IN ('b2b_retailer', 'b2b_wholesaler')
      AND drug_license_expiry IS NOT NULL
      AND drug_license_expiry BETWEEN NOW() AND NOW() + INTERVAL '60 days'
      AND kyc_status = 'approved'
  `);
  for (const user of expiringDLs.rows) {
    await pool.query(`
      UPDATE users SET kyc_status = 'pending_renewal' WHERE id = $1
    `, [user.id]);
    logger.info(`DL expiry alert sent for user ${user.id}, DL expires ${user.drug_license_expiry}`);
  }

  // 2. Re-check GSTIN status for all active B2B accounts
  const b2bAccounts = await pool.query(`
    SELECT id, gstin, business_name FROM users
    WHERE customer_type IN ('b2b_retailer', 'b2b_wholesaler')
      AND gstin IS NOT NULL AND gstin != ''
      AND kyc_status = 'approved'
  `);
  for (const user of b2bAccounts.rows) {
    const result = await GSTINVerifier.verify(user.gstin, user.id);
    if (!result.valid || result.status !== 'Active') {
      await pool.query(`
        UPDATE users SET kyc_status = 'flagged_gstin', updated_at = NOW() WHERE id = $1
      `, [user.id]);
      logger.warn(`GSTIN flagged for user ${user.id}: ${user.gstin} status = ${result.status}`);
    }
    // Rate limit: 1 second between GSTN API calls
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  logger.info('Monthly re-verification complete');
}

// ── Notification helpers (stubs — implemented in notification.service.ts) ─────
async function notifyUserKYCRejected(userId: string, docType: string, reason?: string): Promise<void> {
  // TODO: trigger SMS + email to user explaining what was rejected and how to resubmit
  logger.info(`KYC rejection notification queued for user ${userId}, doc: ${docType}`);
}

async function notifyAdminNewKYC(userId: string, customerType: string, docNumber: string, portalUrl: string): Promise<void> {
  // TODO: send notification to admin WhatsApp / email group with portal link for verification
  logger.info(`New KYC queued for admin review: user ${userId} (${customerType}), doc: ${docNumber}`);
}

async function notifyUserAccountActivated(userId: string): Promise<void> {
  // TODO: SMS + email to user: "Your Dawabag account is now active. You can start placing orders."
  logger.info(`Account activation notification queued for user ${userId}`);
}
