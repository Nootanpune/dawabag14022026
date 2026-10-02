import Link from 'next/link';
import { licenceLabel, type PartnerListRow } from '@/lib/admin/partnerOnboarding';
import LicenceExpiryBadge from '@/components/licences/LicenceExpiryBadge';
import StatusBadge from '../StatusBadge';

/** Every marketplace partner, with licences, pharmacists and logins at a glance. */
export default function PartnerTable({ partners }: { partners: PartnerListRow[] }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
            <th className="font-medium px-4 py-2.5">Partner</th>
            <th className="font-medium px-4 py-2.5">GSTIN</th>
            <th className="font-medium px-4 py-2.5">Licences</th>
            <th className="font-medium px-4 py-2.5">Logins</th>
            <th className="font-medium px-4 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody>
          {partners.map((p) => (
            <tr key={p.id} className="border-b border-gray-50 align-top">
              <td className="px-4 py-2.5">
                <Link href={`/admin/partners/${p.id}`} className="font-medium text-brand-700 hover:underline">{p.name}</Link>
                <p className="text-xs text-gray-500">{[p.trade_name, p.city, p.pincode].filter(Boolean).join(' · ')}</p>
              </td>
              <td className="px-4 py-2.5 font-mono text-xs">{p.gst_number ?? 'No GSTIN'}</td>
              <td className="px-4 py-2.5 text-xs">
                <p>{p.licence_types.length ? p.licence_types.map(licenceLabel).join(', ') : 'Not entered here'}</p>
                <LicenceExpiryBadge b={p} />
              </td>
              <td className="px-4 py-2.5 text-xs">{p.logins?.length ?? 0} · pharmacists {p.pharmacists}</td>
              <td className="px-4 py-2.5"><StatusBadge status={p.is_active ? p.approval_status : 'suspended'} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
