'use client';
import { useState } from 'react';
import { verifyIdentity, type IdentityDecision, type KycApplicant } from '@/lib/admin/kyc';
import DecisionActions from './DecisionActions';
import DecisionCard from './DecisionCard';
import { useKycDecision } from './useKycActions';

interface Props {
  user: KycApplicant;
  documentType: 'pan' | 'gstin';
  result: string;
}

export default function IdentityDecisionForm({ user, documentType, result }: Props) {
  const [notes, setNotes] = useState('');
  const decision = useKycDecision<IdentityDecision>(user.id, verifyIdentity);
  const label = documentType === 'pan' ? 'PAN' : 'GSTIN';
  const value = documentType === 'pan' ? user.pan_number : user.gstin;

  const send = (verified: boolean, rejection_reason?: string) =>
    decision.mutate({
      user_id: user.id,
      document_type: documentType,
      verified,
      rejection_reason,
      notes: notes.trim() || undefined,
    });

  return (
    <DecisionCard title={`${label}: ${value ?? '—'}`} result={result}>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className="input text-sm"
      />
      <DecisionActions
        pending={decision.isPending}
        onVerify={() => send(true)}
        onFail={(reason) => send(false, reason)}
        failTitle={`Fail ${label} check`}
      />
    </DecisionCard>
  );
}
