'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchPractitioners, kycDocumentLink, type PractitionerRow } from '@/lib/practitioner/admin';
import { practitionerKeys, REGISTRATION_STATUS_LABELS } from '@/lib/practitioner/api';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { useAuthStore } from '@/store/authStore';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import RegistrationDecisionDialog from './RegistrationDecisionDialog';

/**
 * Doctor and institution buyers' medical council registrations (Sprint 44). No sale until a
 * staff member has checked the register and the uploaded certificate and recorded the valid-till
 * date (Drugs Rules r.65(9)(b); FDA Maharashtra circular Drug/Wholesalers Memo./16/2026/1).
 */
export default function PractitionersPanel() {
  const [filter, setFilter] = useState<'attention' | 'all'>('attention');
  const [open, setOpen] = useState<PractitionerRow | null>(null);
  const role = useAuthStore((s) => s.user?.role);
  const canDecide = role === 'admin' || role === 'super_admin';
  const { data, isLoading, error, refetch, isFetching } = useQuery({ queryKey: practitionerKeys.list(filter), queryFn: () => fetchPractitioners(filter) });
  const view = async (id: string) => {
    try { window.open(await kycDocumentLink(id), '_blank', 'noopener'); } catch (err) { toast.error(getApiErrorMessage(err, 'Could not open the certificate')); }
  };
  return (
    <div>
      <PageHeader title="Doctor and institution registrations" onRefresh={() => refetch()} refreshing={isFetching}
        subtitle="Medicines go to a doctor or institution only when their council registration is verified, in date and its certificate copy is on file." />
      <div className="flex gap-2 mb-3 text-sm">
        <button className={filter === 'attention' ? 'btn-primary text-xs' : 'btn-outline text-xs'} onClick={() => setFilter('attention')}>Needs attention</button>
        <button className={filter === 'all' ? 'btn-primary text-xs' : 'btn-outline text-xs'} onClick={() => setFilter('all')}>All</button>
      </div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!!data && data.length === 0} emptyText="Nothing waiting." />
      <ul className="space-y-2">
        {(data ?? []).map((p) => (
          <li key={p.user_id} className="card text-sm flex flex-wrap items-start justify-between gap-3" data-testid="practitioner-row">
            <div className="min-w-0">
              <p className="font-medium">{p.business_name || p.name || '—'} <span className="text-xs text-gray-500">({p.kind === 'institution' ? 'institution' : 'doctor'})</span></p>
              <p className="text-xs text-gray-600">{p.registration_number ?? '—'} · {p.council ?? '—'}{p.valid_till ? ` · valid till ${p.valid_till}` : ''}</p>
              <p className="text-xs">{REGISTRATION_STATUS_LABELS[p.status] ?? p.status}{p.can_order ? ' — may order' : ` — ${p.message}`}</p>
              {p.note && <p className="text-xs text-gray-500">{p.note}</p>}
            </div>
            <div className="flex gap-2">
              {p.certificate_document_id
                ? <button type="button" className="btn-outline text-xs" onClick={() => view(p.certificate_document_id!)}>Certificate</button>
                : <span className="text-xs text-red-700">No certificate uploaded</span>}
              {canDecide && <button type="button" className="btn-primary text-xs" onClick={() => setOpen(p)}>Decide</button>}
            </div>
          </li>
        ))}
      </ul>
      {open && <RegistrationDecisionDialog row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
