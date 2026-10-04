'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Rocket } from 'lucide-react';
import { fetchLaunchReadiness, launchReadinessKey, readyText } from '@/lib/admin/launchReadiness';

/** Sprint 49: dashboard card — "X of Y ready" for launch, linking to the full checklist. */
export default function LaunchReadinessCard() {
  const { data } = useQuery({ queryKey: launchReadinessKey, queryFn: fetchLaunchReadiness, staleTime: 5 * 60_000 });
  if (!data) return null;
  const s = data.summary;
  return (
    <Link href="/admin/launch-readiness" className="card mb-6 flex items-center gap-4 hover:border-brand-300" data-testid="launch-readiness-card">
      <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
        <Rocket className="w-5 h-5 text-brand-600" aria-hidden="true" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-sm text-gray-900">Launch readiness: {readyText(s)}</p>
        <p className="text-xs text-gray-500">{s.in_progress} in progress · {s.not_started} not started — open the checklist</p>
      </div>
    </Link>
  );
}
