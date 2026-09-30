import api from '../api';

export interface JobRun {
  id: string;
  status: 'running' | 'succeeded' | 'failed';
  started_at: string;
  finished_at: string | null;
  summary: unknown;
  error: string | null;
  triggered_by: string | null;
}

export interface ScheduledJob {
  name: string;
  description: string;
  cron: string;
  recent_runs: JobRun[];
}

export interface JobRunResult {
  run_id?: string;
  status?: string;
  summary?: unknown;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

export const jobKeys = { list: ['admin', 'jobs'] as const };

export async function fetchJobs(): Promise<{ timezone: string; jobs: ScheduledJob[] }> {
  const { data } = await api.get('/admin/jobs');
  return { timezone: data.data?.timezone ?? 'Asia/Kolkata', jobs: data.data?.jobs ?? [] };
}

export async function runJob(name: string): Promise<JobRunResult> {
  const { data } = await api.post(`/admin/jobs/${encodeURIComponent(name)}/run`);
  return data.data;
}

/** Human-readable text for a 5-field cron expression (server runs it in IST). */
export function describeCron(cron: string): string {
  const [min, hour, dom, mon, dow] = cron.trim().split(/\s+/);
  const isNum = (v?: string) => !!v && /^\d+$/.test(v);
  if (!isNum(min) || !isNum(hour)) return `cron ${cron} (IST)`;
  const h = Number(hour);
  const time = `${((h + 11) % 12) + 1}:${min.padStart(2, '0')} ${h < 12 ? 'am' : 'pm'} IST`;
  if (dom === '*' && mon === '*' && dow === '*') return `Daily at ${time}`;
  if (isNum(dom) && mon === '*' && dow === '*') return `Monthly on day ${dom} at ${time}`;
  if (dom === '*' && mon === '*' && isNum(dow)) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `Every ${days[Number(dow) % 7]} at ${time}`;
  }
  return `cron ${cron} (IST)`;
}

/** Summary objects like { warned: 0, blocked: 1 } → "warned: 0 · blocked: 1" */
export function formatSummary(summary: unknown): string {
  if (summary == null) return '';
  if (typeof summary === 'string') return summary;
  if (typeof summary === 'object') {
    return Object.entries(summary as Record<string, unknown>)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join(' · ');
  }
  return String(summary);
}
