'use client';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import api from '@/lib/api';

interface ConfigWarning { code: string; message: string }

/**
 * Sprint 40: integrations missing on this server that change what people see — e.g. no SMS
 * provider, so sign-in and "Forgot password" codes cannot be sent. From the server
 * (GET /admin/config-warnings); shown on the admin dashboard.
 */
export default function ConfigWarnings() {
  const { data } = useQuery({
    queryKey: ['admin', 'config-warnings'],
    queryFn: async () => { const { data: d } = await api.get('/admin/config-warnings'); return (d.data?.warnings ?? []) as ConfigWarning[]; },
    staleTime: 5 * 60_000,
  });
  if (!data?.length) return null;
  return (
    <div className="mb-4 space-y-2" role="status" aria-label="Configuration warnings">
      {data.map((w) => (
        <p key={w.code} className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3" data-testid={`config-warning-${w.code}`}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" /> {w.message}
        </p>
      ))}
    </div>
  );
}
