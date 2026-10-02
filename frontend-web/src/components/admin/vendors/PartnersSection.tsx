'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fetchApprovedPartners, partnerAdminKeys, type ApprovedVendor } from '@/lib/admin/partners';
import QueryState from '../QueryState';
import LinkPartnerLoginDialog from './LinkPartnerLoginDialog';
import CommissionDialog from './CommissionDialog';

/** Approved marketplace partners: link a portal login, set commission. */
export default function PartnersSection() {
  const [linking, setLinking] = useState<ApprovedVendor | null>(null);
  const [commission, setCommission] = useState<ApprovedVendor | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: partnerAdminKeys.approved, queryFn: fetchApprovedPartners });

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-base font-semibold">Marketplace partners</h2>
        {/* Sprint 28: onboard a partner directly, with licences, pharmacists and logins */}
        <Link href="/admin/partners/new" className="btn-outline text-xs py-1.5 px-3">Add partner</Link>
      </div>
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No approved marketplace partners" />
      {!!data?.length && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                <th className="font-medium px-4 py-2.5">Partner</th>
                <th className="font-medium px-4 py-2.5">Licence / GST</th>
                <th className="font-medium px-4 py-2.5">Location</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.map((v) => (
                <tr key={v.id} className="border-b border-gray-50 align-top">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{v.name}</p>
                    <p className="text-xs text-gray-400">
                      {v.contact_name ?? ''} {v.contact_mobile ?? ''} · rating {v.vendor_rating ?? '—'}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <p>{v.drug_license_no ?? '—'}</p>
                    <p className="text-gray-400">{v.gst_number ?? 'No GSTIN'}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {[v.city, v.state].filter(Boolean).join(', ') || '—'} {v.pincode ?? ''}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-2 justify-end flex-wrap">
                      <button onClick={() => setLinking(v)} className="btn-outline text-xs py-1.5 px-3 whitespace-nowrap">
                        Link partner login (mobile)
                      </button>
                      <button onClick={() => setCommission(v)} className="btn-outline text-xs py-1.5 px-3">
                        Commission
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {linking && <LinkPartnerLoginDialog vendor={linking} onClose={() => setLinking(null)} />}
      {commission && <CommissionDialog vendor={commission} onClose={() => setCommission(null)} />}
    </section>
  );
}
