'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { describeCron, formatSummary, runJob, type ScheduledJob } from '@/lib/admin/jobs';
import { formatDateTimeIST } from '@/lib/admin/format';
import { getApiErrorMessage } from '@/lib/apiErrors';
import StatusBadge from '../StatusBadge';

export default function JobCard({ job, canRun }: { job: ScheduledJob; canRun: boolean }) {
  const queryClient = useQueryClient();
  const run = useMutation({
    mutationFn: () => runJob(job.name),
    onSuccess: (res) => {
      if (res?.skipped) toast.info(`Skipped: ${res.reason ?? 'already running'}`);
      else if (res?.status === 'failed') toast.error(`${job.name} failed: ${res.error ?? 'unknown error'}`);
      else toast.success(`${job.name}: ${res?.status ?? 'started'}${res?.summary ? ` — ${formatSummary(res.summary)}` : ''}`);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not run job')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] }),
  });

  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-gray-900 font-mono text-sm">{job.name}</p>
          <p className="text-sm text-gray-600 mt-0.5">{job.description}</p>
          <p className="text-xs text-gray-400 mt-1">
            {describeCron(job.cron)} <span className="font-mono">({job.cron})</span>
          </p>
        </div>
        {canRun && (
          <button
            onClick={() => run.mutate()}
            disabled={run.isPending}
            className="btn-outline text-sm py-1.5 inline-flex items-center gap-1.5"
          >
            {run.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run now
          </button>
        )}
      </div>

      <div className="mt-3 border-t border-gray-100 pt-2">
        <p className="text-xs font-medium text-gray-500 mb-1">Recent runs</p>
        {job.recent_runs.length === 0 ? (
          <p className="text-xs text-gray-400">Never run.</p>
        ) : (
          <ul className="space-y-1.5">
            {job.recent_runs.map((r) => (
              <li key={r.id} className="text-xs flex flex-wrap items-start gap-2">
                <StatusBadge status={r.status} />
                <span className="text-gray-500">
                  {formatDateTimeIST(r.started_at)}
                  {r.finished_at ? ` → ${formatDateTimeIST(r.finished_at)}` : ''}
                  {r.triggered_by ? ' · manual' : ''}
                </span>
                {r.error ? (
                  <span className="text-red-600 basis-full">{r.error}</span>
                ) : (
                  r.summary != null && <span className="text-gray-700 basis-full">{formatSummary(r.summary)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
