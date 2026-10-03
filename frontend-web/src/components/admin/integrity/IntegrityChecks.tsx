'use client';
import { useMutation } from '@tanstack/react-query';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { verifyAuditChain, verifyH1Registers } from '@/lib/registers/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import PageHeader from '@/components/admin/PageHeader';
import ChainResultCard from '@/components/registers/ChainResultCard';
import ChainHeadsPanel from './ChainHeadsPanel';

/**
 * Record integrity (Sprint 38): the server recomputes the hash of every Schedule H1
 * register entry (one register per seller licence) and every audit-log entry, and names
 * the first one that was changed, removed or inserted (C-09, C-46). Each check is itself
 * recorded in the audit log.
 */
export default function IntegrityChecks() {
  const h1 = useMutation({ mutationFn: verifyH1Registers, onError: (e) => toast.error(getApiErrorMessage(e, 'Check failed')) });
  const audit = useMutation({ mutationFn: verifyAuditChain, onError: (e) => toast.error(getApiErrorMessage(e, 'Check failed')) });
  return (
    <div>
      <PageHeader title="Record integrity" subtitle="Check that the Schedule H1 registers and the audit log are exactly as written." />
      <ChainHeadsPanel />
      <section className="mb-6" aria-labelledby="h1-check">
        <h2 id="h1-check" className="text-sm font-semibold text-gray-800 mb-2">Schedule H1 registers (Dawabag and every partner)</h2>
        <button onClick={() => h1.mutate()} disabled={h1.isPending} className="btn-outline text-sm inline-flex items-center gap-2 mb-3 disabled:opacity-50">
          {h1.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Check the H1 registers
        </button>
        {h1.data && (
          <div className="space-y-2">
            {h1.data.registers.length === 0 && <p className="text-sm text-gray-600">No register entries yet.</p>}
            {h1.data.registers.map((r) => <ChainResultCard key={r.register_key} title={r.register_key} report={r} />)}
          </div>
        )}
      </section>
      <section aria-labelledby="audit-check">
        <h2 id="audit-check" className="text-sm font-semibold text-gray-800 mb-2">Audit log</h2>
        <button onClick={() => audit.mutate()} disabled={audit.isPending} className="btn-outline text-sm inline-flex items-center gap-2 mb-3 disabled:opacity-50">
          {audit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Check the audit log
        </button>
        {audit.data && <ChainResultCard title="Audit log" report={audit.data} />}
      </section>
    </div>
  );
}
