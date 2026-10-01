import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { categoryLabel, type GrievanceSummary } from '@/lib/grievances/api';
import GrievanceStatusBadge from './GrievanceStatusBadge';
import GrievanceDueDates from './GrievanceDueDates';
import { formatDateIST } from '@/lib/dates';

/** One complaint in the buyer's list: ticket, status and due dates (C-36). */
export default function ComplaintListItem({ g }: { g: GrievanceSummary }) {
  return (
    <Link href={`/account/complaints/${g.id}`} className="card flex items-start gap-3 hover:border-brand-200">
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-gray-500">{g.ticket_no}</span>
          <GrievanceStatusBadge status={g.status} />
        </div>
        <p className="font-medium text-sm mt-1 line-clamp-1">{g.subject}</p>
        <p className="text-xs text-gray-400 mb-1">
          {categoryLabel(g.category)}
          {g.order_number ? ` · Order ${g.order_number}` : ''} · raised {formatDateIST(g.created_at)}
        </p>
        <GrievanceDueDates g={g} compact />
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 mt-1" />
    </Link>
  );
}
