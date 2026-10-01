'use client';
import type { KycApplication } from '@/lib/admin/kyc';
import IdentityDecisionForm from './IdentityDecisionForm';
import DrugLicenseDecisionForm from './DrugLicenseDecisionForm';
import NmcDecisionForm from './NmcDecisionForm';
import RejectApplicationButton from './RejectApplicationButton';

/** One decision form per check returned by the server. */
export default function DecisionPanel({ application }: { application: KycApplication }) {
  const { user, checks } = application;
  const closed = user.kyc_status === 'rejected';

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
          return <DrugLicenseDecisionForm key={key} user={user} result={c.result} />;
        }
        if (c.check === 'nmc_registration') {
          return <NmcDecisionForm key={key} user={user} result={c.result} />;
        }
        return null;
      })}
    </div>
  );
}
