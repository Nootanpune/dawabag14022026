'use client';
import { useState } from 'react';
import { toApiDlType, verifyDrugLicense, type DrugLicenseDecision, type KycApplicant } from '@/lib/admin/kyc';
import DecisionActions from './DecisionActions';
import DecisionCard from './DecisionCard';
import { useKycDecision } from './useKycActions';

const DL_TYPES: DrugLicenseDecision['dl_type'][] = ['DL-20', 'DL-21', 'DL-20B', 'DL-21B'];

export default function DrugLicenseDecisionForm({ user, result }: { user: KycApplicant; result: string }) {
  const [dlNumber, setDlNumber] = useState(user.drug_license_number ?? '');
  const [dlType, setDlType] = useState<DrugLicenseDecision['dl_type'] | ''>(toApiDlType(user.drug_license_type) ?? '');
  const [validUpto, setValidUpto] = useState(user.drug_license_expiry?.slice(0, 10) ?? '');
  const [holder, setHolder] = useState('');
  const [premises, setPremises] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const decision = useKycDecision<DrugLicenseDecision>(user.id, verifyDrugLicense);

  const send = (verified: boolean, rejection_reason?: string) => {
    if (!dlNumber.trim() || !dlType) return setError('Licence number and type are required');
    if (verified && !validUpto) return setError('Enter the licence valid-upto date to verify');
    setError('');
    decision.mutate({
      user_id: user.id,
      dl_number: dlNumber.trim(),
      dl_type: dlType,
      verified,
      valid_upto: validUpto || undefined,
      license_holder_name: holder.trim() || undefined,
      premises_address: premises.trim() || undefined,
      rejection_reason,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <DecisionCard title="Drug licence" result={result}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <label className="block">
          <span className="text-xs text-gray-500">Licence number</span>
          <input value={dlNumber} onChange={(e) => setDlNumber(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Form</span>
          <select value={dlType} onChange={(e) => setDlType(e.target.value as typeof dlType)} className="input">
            <option value="">Select</option>
            {DL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Valid upto (required to verify)</span>
          <input type="date" value={validUpto} onChange={(e) => setValidUpto(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Holder name (optional)</span>
          <input value={holder} onChange={(e) => setHolder(e.target.value)} className="input" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs text-gray-500">Premises address (optional)</span>
          <input value={premises} onChange={(e) => setPremises(e.target.value)} className="input" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs text-gray-500">Notes (optional)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" />
        </label>
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      <DecisionActions
        pending={decision.isPending}
        onVerify={() => send(true)}
        onFail={(reason) => send(false, reason)}
        failTitle="Fail drug licence check"
      />
    </DecisionCard>
  );
}
