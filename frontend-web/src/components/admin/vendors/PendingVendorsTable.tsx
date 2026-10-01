'use client';
import { ExternalLink } from 'lucide-react';
import type { PendingVendor } from '@/lib/admin/vendors';
import { formatDateIST } from '@/lib/dates';

interface Props {
  vendors: PendingVendor[];
  onApprove: (v: PendingVendor) => void;
  onReject: (v: PendingVendor) => void;
}

export default function PendingVendorsTable({ vendors, onApprove, onReject }: Props) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
            <th className="font-medium px-4 py-2.5">Vendor</th>
            <th className="font-medium px-4 py-2.5">Contact</th>
            <th className="font-medium px-4 py-2.5">Licence / GST</th>
            <th className="font-medium px-4 py-2.5">Location</th>
            <th className="font-medium px-4 py-2.5">Applied</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr key={v.id} className="border-b border-gray-50 align-top">
              <td className="px-4 py-2.5">
                <p className="font-medium">{v.name}</p>
                <p className="text-xs text-gray-400">{v.vendor_type?.replace(/_/g, ' ') ?? '—'}</p>
              </td>
              <td className="px-4 py-2.5 text-xs">
                <p>{v.contact_name ?? '—'}</p>
                <p className="text-gray-400">{v.contact_mobile ?? ''}</p>
                <p className="text-gray-400">{v.contact_email ?? ''}</p>
              </td>
              <td className="px-4 py-2.5 text-xs">
                <p>{v.drug_license_no ?? '—'}</p>
                <p className="text-gray-400">{v.gst_number ?? 'No GSTIN'}</p>
                {v.dl_portal_url && (
                  <a
                    href={v.dl_portal_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-600 hover:underline inline-flex items-center gap-1 mt-0.5"
                  >
                    Licence portal <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </td>
              <td className="px-4 py-2.5 text-xs">
                {[v.city, v.state].filter(Boolean).join(', ') || '—'} {v.pincode ?? ''}
              </td>
              <td className="px-4 py-2.5 text-xs text-gray-500">{formatDateIST(v.created_at)}</td>
              <td className="px-4 py-2.5">
                <div className="flex gap-2 justify-end">
                  <button onClick={() => onApprove(v)} className="btn-primary text-xs py-1.5 px-3">
                    Approve
                  </button>
                  <button
                    onClick={() => onReject(v)}
                    className="border border-red-500 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50"
                  >
                    Reject
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
