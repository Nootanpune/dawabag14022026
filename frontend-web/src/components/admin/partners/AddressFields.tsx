'use client';
import type { PartnerFormValues } from '@/lib/admin/partnerOnboarding';
import FormSection from './FormSection';
import TextField from './TextField';

/** The licensed premises the partner dispatches from (on invoices; used for the nearest seller). */
export default function AddressFields({ v, set }: { v: PartnerFormValues; set: (patch: Partial<PartnerFormValues>) => void }) {
  return (
    <FormSection title="Address" hint="The licensed premises, as on the drug licence. It must be in the GSTIN's state.">
      <div className="grid sm:grid-cols-2 gap-3">
        <TextField label="Address line 1" value={v.address_line1} onChange={(x) => set({ address_line1: x })} required maxLength={500}
          className="sm:col-span-2" />
        <TextField label="Address line 2 (optional)" value={v.address_line2} onChange={(x) => set({ address_line2: x })} maxLength={500}
          className="sm:col-span-2" />
        <TextField label="City" value={v.city} onChange={(x) => set({ city: x })} required maxLength={100} />
        <TextField label="State" value={v.state} onChange={(x) => set({ state: x })} required maxLength={100} hint="Full name, e.g. Maharashtra" />
        <TextField label="PIN code" value={v.pincode} onChange={(x) => set({ pincode: x.replace(/\D/g, '') })} inputMode="numeric"
          maxLength={6} required />
      </div>
    </FormSection>
  );
}
