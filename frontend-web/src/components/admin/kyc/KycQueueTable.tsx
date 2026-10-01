'use client';
import { useRouter } from 'next/navigation';
import type { KycQueueRow } from '@/lib/admin/kyc';
import { CUSTOMER_TYPE_SHORT } from '@/lib/admin/format';
import StatusBadge from '../StatusBadge';
import { formatDateTimeIST } from '@/lib/dates';

export default function KycQueueTable({ rows }: { rows: KycQueueRow[] }) {
  const router = useRouter();
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Applicant</th>
            <th className="font-medium px-4 py-2.5">Type</th>
            <th className="font-medium px-4 py-2.5">Status</th>
            <th className="font-medium px-4 py-2.5">Licence / NMC</th>
            <th className="font-medium px-4 py-2.5">Pending checks</th>
            <th className="font-medium px-4 py-2.5">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.user_id}
              onClick={() => router.push(`/admin/kyc/${r.user_id}`)}
              className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
            >
              <td className="px-4 py-2.5">
                <p className="font-medium text-brand-700">{r.business_name || r.full_name}</p>
                <p className="text-xs text-gray-400">
                  {r.business_name ? `${r.full_name} · ` : ''}
                  {r.mobile}
                </p>
              </td>
              <td className="px-4 py-2.5">{CUSTOMER_TYPE_SHORT[r.customer_type] ?? r.customer_type}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={r.kyc_status} />
              </td>
              <td className="px-4 py-2.5 text-xs text-gray-600">{r.drug_license_number || r.nmc_reg_number || '—'}</td>
              <td className="px-4 py-2.5">{String(r.pending_checks)}</td>
              <td className="px-4 py-2.5 text-xs text-gray-500">{formatDateTimeIST(r.kyc_submitted_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
