'use client';
import type { Supplier } from '@/lib/purchasing/types';
import StatusBadge from '../StatusBadge';
import LicenceList from '@/components/licences/LicenceList';
import LicenceExpiryBadge from '@/components/licences/LicenceExpiryBadge';

interface Props {
  suppliers: Supplier[];
  onApprove: (s: Supplier) => void;
  onEdit: (s: Supplier) => void;
}

/** Suppliers with every drug licence; purchases are blocked unless "can supply" (C-02). */
export default function SupplierTable({ suppliers, onApprove, onEdit }: Props) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Supplier</th>
            <th className="font-medium px-4 py-2.5">Drug licences</th>
            <th className="font-medium px-4 py-2.5">GSTIN</th>
            <th className="font-medium px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.id} className="border-b border-gray-50 align-top" data-testid="supplier-row">
              <td className="px-4 py-2.5">
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-gray-400">{s.state ?? '—'}</p>
              </td>
              <td className="px-4 py-2.5 min-w-[16rem]">
                <LicenceExpiryBadge b={s} />
                <LicenceList licences={s.licences ?? []} compact label={`${s.name} drug licences`} />
              </td>
              <td className="px-4 py-2.5 text-xs font-mono">{s.gst_number ?? '—'}</td>
              <td className="px-4 py-2.5 space-x-1">
                <StatusBadge status={s.approval_status} />
                {!s.is_active && <StatusBadge status="paused" label="inactive" />}
                {s.can_supply ? (
                  <StatusBadge status="active" label="can supply" />
                ) : (
                  s.approval_status === 'approved' && <StatusBadge status="expired" label="blocked" />
                )}
              </td>
              <td className="px-4 py-2.5 text-right space-x-1 whitespace-nowrap">
                <button onClick={() => onEdit(s)} className="btn-outline text-xs py-1.5 px-3">Edit licences</button>
                {s.approval_status === 'pending' && (
                  <button onClick={() => onApprove(s)} className="btn-primary text-xs py-1.5 px-3">Approve</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
