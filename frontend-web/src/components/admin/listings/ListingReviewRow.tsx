'use client';
import type { ListingForReview } from '@/lib/admin/listings';
import { formatPrice } from '@/lib/utils';
import StatusBadge from '../StatusBadge';
import { scheduleBadge } from '@/lib/drugSchedule';
import { formatDateIST } from '@/lib/dates';

interface Props {
  l: ListingForReview;
  canPostLive: boolean;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onPostLive: () => void;
}

export default function ListingReviewRow({ l, canPostLive, busy, onApprove, onReject, onPostLive }: Props) {
  const awaitingApproval = l.approval_status === 'pending';
  const readyToPost = l.approval_status === 'approved' && l.listing_status !== 'live';
  return (
    <tr className="border-b border-gray-50 align-top">
      <td className="px-4 py-2.5">
        <p className="font-medium">{l.medicine_name}</p>
        <p className="text-xs text-gray-400">
          MRP {formatPrice(l.mrp_paise)}
          {scheduleBadge(l.drug_schedule) ? ` · ${scheduleBadge(l.drug_schedule)}` : ''}
          {l.partner_sku ? ` · SKU ${l.partner_sku}` : ''}
          {l.cold_chain && <span className="badge-cold ml-2">Cold chain</span>}
        </p>
        <p className="text-xs text-gray-400">
          Submitted {formatDateIST(l.submission_date)} · stock {l.qty_available ?? 0}
        </p>
      </td>
      <td className="px-4 py-2.5 text-xs">
        <p className="font-medium text-sm">{l.partner_name}</p>
        <p>GSTIN {l.gst_number ?? '—'}</p>
        <p>DL {l.drug_license_no ?? '—'} · exp {formatDateIST(l.drug_license_expiry)}</p>
        <p className="text-gray-400">
          {l.pincode ?? ''} · rating {l.vendor_rating ?? '—'}
        </p>
      </td>
      <td className="px-4 py-2.5 text-xs">
        {l.h1_pharmacist_name || l.h1_pharmacist_reg_no ? (
          <>
            <p>{l.h1_pharmacist_name}</p>
            <p>Reg. {l.h1_pharmacist_reg_no}</p>
            <p>{l.h1_secure_storage_declared ? 'Secure storage declared' : 'No storage declaration'}</p>
          </>
        ) : (
          <span className="text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-2.5 space-y-1">
        <StatusBadge status={l.approval_status} />
        <div>
          <StatusBadge status={l.listing_status} />
        </div>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex gap-2 justify-end flex-wrap">
          {awaitingApproval && (
            <button onClick={onApprove} disabled={busy} className="btn-primary text-xs py-1.5 px-3">
              Approve
            </button>
          )}
          {readyToPost && canPostLive && (
            <button onClick={onPostLive} disabled={busy} className="btn-primary text-xs py-1.5 px-3 whitespace-nowrap">
              Post live
            </button>
          )}
          <button
            onClick={onReject}
            disabled={busy}
            className="border border-red-500 text-red-600 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50"
          >
            Reject
          </button>
        </div>
      </td>
    </tr>
  );
}
