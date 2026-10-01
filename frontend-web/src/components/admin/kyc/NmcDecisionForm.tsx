'use client';
import { useState } from 'react';
import { verifyNmc, type KycApplicant, type NmcDecision } from '@/lib/admin/kyc';
import DecisionActions from './DecisionActions';
import DecisionCard from './DecisionCard';
import { useKycDecision } from './useKycActions';

export default function NmcDecisionForm({ user, result }: { user: KycApplicant; result: string }) {
  const [nmcNumber, setNmcNumber] = useState(user.nmc_reg_number ?? '');
  const [council, setCouncil] = useState(user.nmc_council_state ?? '');
  const [nameAsPerRegister, setNameAsPerRegister] = useState('');
  const [qualification, setQualification] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const decision = useKycDecision<NmcDecision>(user.id, verifyNmc);

  const send = (verified: boolean, rejection_reason?: string) => {
    if (!nmcNumber.trim() || !council.trim()) return setError('Registration number and council are required');
    setError('');
    decision.mutate({
      user_id: user.id,
      nmc_number: nmcNumber.trim(),
      council_state: council.trim(),
      verified,
      doctor_name_as_per_register: nameAsPerRegister.trim() || undefined,
      qualification: qualification.trim() || undefined,
      rejection_reason,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <DecisionCard title="NMC / council registration" result={result}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        <label className="block">
          <span className="text-xs text-gray-500">Registration number</span>
          <input value={nmcNumber} onChange={(e) => setNmcNumber(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Council</span>
          <input value={council} onChange={(e) => setCouncil(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Name as per register (optional)</span>
          <input value={nameAsPerRegister} onChange={(e) => setNameAsPerRegister(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Qualification (optional)</span>
          <input value={qualification} onChange={(e) => setQualification(e.target.value)} className="input" />
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
        failTitle="Fail NMC registration check"
      />
    </DecisionCard>
  );
}
