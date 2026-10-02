import {
  allowsCreditTerms, effectiveCustomerType, priceField, requiredKycDocuments, requiresPrescription,
} from './customerType';

describe('effectiveCustomerType', () => {
  it('keeps B2C as customer regardless of KYC', () => {
    expect(effectiveCustomerType('customer', 'not_required')).toBe('customer');
  });

  it.each(['b2b_retailer', 'b2b_wholesaler', 'doc_hospital'])(
    'grants %s its own type only once KYC is approved', (type) => {
      expect(effectiveCustomerType(type, 'approved')).toBe(type);
      for (const status of ['pending_otp', 'pending_kyc', 'rejected', 'suspended', 'pending_renewal', 'flagged_gstin', null]) {
        expect(effectiveCustomerType(type, status)).toBe('customer');
      }
    });

  it('treats unknown or staff types as customer', () => {
    expect(effectiveCustomerType('admin', 'approved')).toBe('customer');
    expect(effectiveCustomerType(undefined, 'approved')).toBe('customer');
  });
});

describe('priceField', () => {
  it('maps each buyer type to its price column', () => {
    expect(priceField('customer')).toBe('offer_price_paise');
    expect(priceField('b2b_retailer')).toBe('ptr_price_paise');
    expect(priceField('b2b_wholesaler')).toBe('pts_price_paise');
    expect(priceField('doc_hospital')).toBe('institutional_price_paise');
  });
});

describe('requiresPrescription', () => {
  it('requires Rx for B2C Schedule H and H1 only', () => {
    expect(requiresPrescription('customer', 'Schedule H')).toBe(true);
    expect(requiresPrescription('customer', 'Schedule H1')).toBe(true);
    expect(requiresPrescription('customer', 'OTC')).toBe(false);
    expect(requiresPrescription('customer', 'Non-scheduled')).toBe(false);   // Sprint 31
  });

  it('exempts licensed buyers', () => {
    expect(requiresPrescription('b2b_retailer', 'Schedule H')).toBe(false);
    expect(requiresPrescription('doc_hospital', 'Schedule H1')).toBe(false);
  });
});

describe('allowsCreditTerms', () => {
  it('allows credit/CAD only for retailers and wholesalers', () => {
    expect(allowsCreditTerms('b2b_retailer')).toBe(true);
    expect(allowsCreditTerms('b2b_wholesaler')).toBe(true);
    expect(allowsCreditTerms('doc_hospital')).toBe(false);
    expect(allowsCreditTerms('customer')).toBe(false);
  });
});

describe('requiredKycDocuments (URS v3.1 document matrix)', () => {
  it('asks a retailer for the GST certificate only when a GSTIN was given', () => {
    expect(requiredKycDocuments('b2b_retailer', false)).toEqual(['drug_license', 'pan_card']);
    expect(requiredKycDocuments('b2b_retailer', true)).toEqual(['drug_license', 'pan_card', 'gst_certificate']);
  });

  it('asks a wholesaler for licence, GST, PAN and cancelled cheque', () => {
    expect(requiredKycDocuments('b2b_wholesaler', true))
      .toEqual(['drug_license', 'gst_certificate', 'pan_card', 'cancelled_cheque']);
  });

  it('asks a doctor for NMC certificate and PAN; B2C for nothing', () => {
    expect(requiredKycDocuments('doc_hospital', false)).toEqual(['nmc_certificate', 'pan_card']);
    expect(requiredKycDocuments('customer', false)).toEqual([]);
  });
});
