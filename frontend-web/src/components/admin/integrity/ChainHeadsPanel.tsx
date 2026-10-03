'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatDateTimeIST } from '@/lib/dates';
import { chainHeadKeys, fetchChainHeads, runChainCheck } from '@/lib/registers/api';

/**
 * Sprint 40: the nightly chain check (job chain_verify, 02:20 IST) records where every chain
 * ends — entry number and hash — in an append-only table. The next run checks the old head is
 * still there unchanged, so cutting off the newest entries is caught too; any break alerts
 * every admin (C-09, C-46).
 */
export default function ChainHeadsPanel() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: chainHeadKeys.heads, queryFn: fetchChainHeads });
  const run = useMutation({
    mutationFn: runChainCheck,
    onSuccess: (r) => {
      if (r.ok) toast.success(`All ${r.chains} chains are whole; heads recorded`);
      else toast.error(`${r.broken} chain(s) broken — admins alerted`);
      queryClient.invalidateQueries({ queryKey: chainHeadKeys.heads });
    },
    onError: (e) => toast.error(getApiErrorMessage(e, 'Check failed')),
  });
  return (
    <section className="mb-6" aria-labelledby="heads">
      <h2 id="heads" className="text-sm font-semibold text-gray-800 mb-1">Nightly check and recorded chain heads</h2>
      <p className="text-xs text-gray-600 mb-2">
        Last nightly run: {data?.last_job_run ? `${formatDateTimeIST(data.last_job_run.started_at)} — ${data.last_job_run.status}` : 'not yet'}.
        {data && Object.keys(data.chain_start).length > 0 && ` Checked from a set start point: ${Object.entries(data.chain_start).map(([k, n]) => `${k} from ${n}`).join(', ')}.`}
      </p>
      <button onClick={() => run.mutate()} disabled={run.isPending} className="btn-outline text-sm inline-flex items-center gap-2 mb-3 disabled:opacity-50">
        {run.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Run the check now and record the heads
      </button>
      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {error && <p className="text-sm text-red-700">{getApiErrorMessage(error, 'Could not load')}</p>}
      {data && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="py-1 pr-2">Chain</th><th className="py-1 pr-2">Head</th><th className="py-1 pr-2">Hash</th><th className="py-1 pr-2">Result</th><th className="py-1">Recorded</th></tr></thead>
            <tbody>
              {data.heads.map((h) => (
                <tr key={h.chain} className="border-b border-gray-100" data-testid="chain-head">
                  <td className="py-1 pr-2 font-mono text-xs">{h.chain}</td>
                  <td className="py-1 pr-2">{h.last_no ?? '—'}</td>
                  <td className="py-1 pr-2 font-mono text-xs" title={h.head_hash ?? ''}>{h.head_hash ? `${h.head_hash.slice(0, 16)}…` : '—'}</td>
                  <td className={`py-1 pr-2 text-xs ${h.ok ? 'text-green-700' : 'text-red-700 font-semibold'}`}>{h.ok ? 'Whole' : h.problem}</td>
                  <td className="py-1 text-xs">{formatDateTimeIST(h.recorded_at)} · {h.source}</td>
                </tr>
              ))}
              {!data.heads.length && <tr><td colSpan={5} className="py-2 text-gray-500">No head recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
