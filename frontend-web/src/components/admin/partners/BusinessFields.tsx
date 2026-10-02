'use client';
import type { PartnerFormValues } from '@/lib/admin/partnerOnboarding';
import { invoicePrefixError } from '@/lib/admin/vendors';
import { gstinProblem } from '@/lib/admin/gstin';
import FormSection from './FormSection';
import TextField from './TextField';

interface Props {
  v: PartnerFormValues;
  set: (patch: Partial<PartnerFormValues>) => void;
  prefixLocked?: boolean;
}

/** Business and GST: legal name as on the GST certificate, contact, invoice series (C-32, C-33). */
export default function BusinessFields({ v, set, prefixLocked }: Props) {
  const prefix = v.invoice_prefix.trim().toUpperCase();
  const gstin = v.gstin.trim();
  return (
    <>
      <FormSection title="Business" hint="As printed on the partner's GST certificate and drug licences.">
        <div className="grid sm:grid-cols-2 gap-3">
          <TextField label="Legal name" value={v.legal_name} onChange={(x) => set({ legal_name: x })} required maxLength={255}
            hint="Exactly as on the GST certificate" />
          <TextField label="Shop / trade name (if different)" value={v.trade_name} onChange={(x) => set({ trade_name: x })} maxLength={255} />
          <TextField label="Contact person" value={v.contact_name} onChange={(x) => set({ contact_name: x })} required maxLength={255} />
          <TextField label="Contact mobile" value={v.contact_mobile} onChange={(x) => set({ contact_mobile: x.replace(/\D/g, '') })}
            inputMode="numeric" maxLength={10} required hint="10 digits, without +91" />
          <TextField label="Contact email (optional)" type="email" value={v.contact_email} onChange={(x) => set({ contact_email: x })} maxLength={255} />
          <TextField label="Invoice prefix" value={v.invoice_prefix} onChange={(x) => set({ invoice_prefix: x.toUpperCase() })}
            maxLength={4} required disabled={prefixLocked}
            hint={prefixLocked ? 'Invoices are already issued in this series, so it cannot change' : '2–4 capital letters or digits; starts the partner\'s own invoice numbers'}
            error={prefix ? invoicePrefixError(prefix) : ''} />
        </div>
      </FormSection>
      <FormSection title="GST" hint="A partner sells on Dawabag only with a GST registration (C-33).">
        <TextField label="GSTIN" value={v.gstin} onChange={(x) => set({ gstin: x.toUpperCase().replace(/\s/g, '') })} maxLength={15}
          required className="max-w-xs font-mono" autoComplete="off"
          hint="15 characters; the first two digits are the state (27 = Maharashtra)"
          error={gstin.length >= 15 ? gstinProblem(gstin) : ''} />
      </FormSection>
    </>
  );
}
