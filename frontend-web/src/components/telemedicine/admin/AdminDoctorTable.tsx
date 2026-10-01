import StatusBadge from '@/components/admin/StatusBadge';
import { formatDateTimeIST, formatPaise } from '@/lib/admin/format';
import type { AdminDoctor } from '@/lib/telemedicine/types';

const statusOf = (d: AdminDoctor) => (d.is_verified ? 'verified' : d.rejection_reason ? 'rejected' : 'pending');

export default function AdminDoctorTable({ rows, onDecide }: { rows: AdminDoctor[]; onDecide: (d: AdminDoctor, approve: boolean) => void }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Doctor</th>
            <th className="font-medium px-4 py-2.5">Registration</th>
            <th className="font-medium px-4 py-2.5 text-right">Fee</th>
            <th className="font-medium px-4 py-2.5">Status</th>
            <th className="font-medium px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => {
            const status = statusOf(d);
            return (
              <tr key={d.id} className="border-b border-gray-50 align-top">
                <td className="px-4 py-2.5">
                  <p className="font-medium">Dr {d.full_name}</p>
                  <p className="text-xs text-gray-500">{d.qualification}</p>
                  <p className="text-xs text-gray-400">
                    +91 {d.mobile}
                    {d.speciality ? ` · ${d.speciality}` : ''}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-xs">
                  <p>{d.council}</p>
                  <p>
                    No. <span className="font-medium">{d.nmc_reg_number}</span> · {d.registration_year}
                  </p>
                </td>
                <td className="px-4 py-2.5 text-right">{formatPaise(d.consultation_fee_paise)}</td>
                <td className="px-4 py-2.5 text-xs space-y-1">
                  <StatusBadge status={status} />
                  {d.verified_at && (
                    <p className="text-gray-500">
                      {formatDateTimeIST(d.verified_at)}
                      {d.verified_by_name ? ` by ${d.verified_by_name}` : ''}
                    </p>
                  )}
                  {d.rejection_reason && <p className="text-red-600">{d.rejection_reason}</p>}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap space-x-2">
                  {status !== 'verified' && (
                    <button onClick={() => onDecide(d, true)} className="btn-primary text-xs py-1 px-3">
                      Verify
                    </button>
                  )}
                  {status !== 'rejected' && (
                    <button onClick={() => onDecide(d, false)} className="btn-outline text-xs py-1 px-3 text-red-600">
                      Reject
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
