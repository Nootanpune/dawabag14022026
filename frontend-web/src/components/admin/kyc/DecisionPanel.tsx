'use client';
import type { KycApplication } from '@/lib/admin/kyc';
import IdentityDecisionForm from './IdentityDecisionForm';
import DrugLicenseDecisionForm from './DrugLicenseDecisionForm';
import NmcDecisionForm from './NmcDecisionForm';
import RejectApplicationButton from './RejectApplicationButton';
import DecisionCard from './DecisionCard';
import { useAuthStore } from '@/store/authStore';

/** One decision form per check returned by the server. */
export default function DecisionPanel({ application }: { application: KycApplication }) {
  const { user, checks } = application;
  const closed = user.kyc_status === 'rejected';
  // Sprint 48: doctor registrations are decided by admins only (as in Admin → Doctor registrations)
  const role = useAuthStore((s) => s.user?.role);
  const canDecideRegistration = role === 'admin' || role === 'super_admin';

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Decisions</h3>
        {!closed && <RejectApplicationButton userId={user.id} />}
      </div>
      {checks.length === 0 && <p className="text-sm text-gray-400">No checks to decide.</p>}
      {checks.map((c) => {
        const key = `${c.check}-${c.result}`;
        if (c.check === 'pan' || c.check === 'gstin') {
          return <IdentityDecisionForm key={key} user={user} documentType={c.check} result={c.result} />;
        }
        if (c.check.startsWith('drug_license')) {
          // Sprint 30: a licence in the register is checked on its own (Drug licences card)
          if (c.licence_id) {
            return (
              <DecisionCard key={key} title={c.label ?? 'Drug licence'} result={c.result}>
                <p className="text-xs text-gray-600">
                  {c.result === 'verified' ? 'Checked.' : 'Check it in Drug licences below: verify with its valid-till date, or say why it is not accepted.'}
                </p>
              </DecisionCard>
            );
          }
          return <DrugLicenseDecisionForm key={key} user={user} result={c.result} />;
        }
        if (c.check === 'nmc_registration') {
          if (!canDecideRegistration) {
            return (
              <DecisionCard key={key} title="Medical council registration" result={c.result}>
                <p className="text-xs text-gray-600">An admin checks the registration and its certificate copy and records the decision.</p>
              </DecisionCard>
            );
          }
          return <NmcDecisionForm key={key} user={user} result={c.result} />;
        }
        return null;
      })}
    </div>
  );
}
