import Link from 'next/link';
import { returnReasonLabel, type ReturnSummary } from '@/lib/returns/api';
import { formatDateTimeIST } from '@/lib/admin/format';
import { formatPrice } from '@/lib/utils';
import StatusBadge from '@/components/admin/StatusBadge';

export default function ReturnListItem({ r, href }: { r: ReturnSummary; href: string }) {
  return (
    <Link href={href} className="card block hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium font-mono text-sm">{r.return_no}</p>
        <StatusBadge status={r.status} />
      </div>
      <p className="text-xs text-gray-500 mt-1">
        Order {r.order_number} · {returnReasonLabel(r.reason)} · {formatDateTimeIST(r.created_at)}
        {r.refund_paise > 0 ? ` · refund ${formatPrice(r.refund_paise)}` : ''}
      </p>
    </Link>
  );
}
