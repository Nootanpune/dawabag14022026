import { ONLINE_SALE_LABELS, type OnlineSaleStatus } from '@/lib/onlineSale/api';

const TONE: Record<OnlineSaleStatus, string> = {
  permitted: 'bg-green-50 text-green-800 border-green-200',
  restricted: 'bg-amber-50 text-amber-900 border-amber-300',
  prohibited: 'bg-red-50 text-red-800 border-red-200',
};

/** The product's online-sale status as staff see it (Sprint 39, C-10). */
export default function OnlineSaleBadge({ status }: { status: OnlineSaleStatus | null | undefined }) {
  if (!status) return null;
  return (
    <span className={`inline-block text-[11px] font-medium border rounded-full px-2 py-0.5 ${TONE[status]}`} data-testid="online-sale-badge">
      {ONLINE_SALE_LABELS[status]}
    </span>
  );
}
