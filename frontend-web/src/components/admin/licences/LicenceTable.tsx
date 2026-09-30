import { licenceTypeLabel, type Licence } from '@/lib/compliance/licences';
import { formatDateIST } from '@/lib/admin/format';
import StatusBadge from '@/components/admin/StatusBadge';

/** Licence register with the server's validity and days left (C-07). */
export default function LicenceTable({ rows, onEdit }: { rows: Licence[]; onEdit: (l: Licence) => void }) {
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr className="text-left">
            <th className="font-medium px-4 py-2.5">Licence</th>
            <th className="font-medium px-4 py-2.5">Premises / issued by</th>
            <th className="font-medium px-4 py-2.5">Valid</th>
            <th className="font-medium px-4 py-2.5">Renewal owner</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((l) => (
            <tr key={l.id} className={`align-top ${l.is_active ? '' : 'opacity-50'} ${l.validity === 'expired' ? 'bg-red-50/40' : ''}`}>
              <td className="px-4 py-2.5">
                <p className="font-medium">{licenceTypeLabel(l.licence_type)}</p>
                <p className="text-xs font-mono text-gray-600">{l.licence_number}</p>
                {!l.is_active && <p className="text-xs text-gray-400">inactive</p>}
              </td>
              <td className="px-4 py-2.5 text-xs">
                {l.premises ?? '—'}
                {l.issued_by && <p className="text-gray-400">{l.issued_by}</p>}
              </td>
              <td className="px-4 py-2.5 text-xs">
                <StatusBadge status={l.validity} />
                <p className="mt-1">
                  {formatDateIST(l.valid_from)} – {l.valid_upto ? formatDateIST(l.valid_upto) : 'no expiry'}
                </p>
                {l.days_left != null && l.validity !== 'no_expiry' && (
                  <p className={l.days_left < 0 ? 'text-red-600' : 'text-gray-500'}>
                    {l.days_left < 0 ? `${-l.days_left} days overdue` : `${l.days_left} days left`}
                  </p>
                )}
              </td>
              <td className="px-4 py-2.5 text-xs">
                {l.renewal_owner}
                {l.renewal_owner_email && <p className="text-gray-400">{l.renewal_owner_email}</p>}
              </td>
              <td className="px-4 py-2.5 text-right">
                <button onClick={() => onEdit(l)} className="btn-outline text-xs py-1 px-2">
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
