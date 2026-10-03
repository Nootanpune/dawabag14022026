import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ChainReport } from '@/lib/registers/api';

/** One chain check result in plain words (Sprint 38; C-09, C-46). */
export default function ChainResultCard({ title, report }: { title: string; report: ChainReport }) {
  return (
    <div className={`rounded-lg border p-3 text-sm ${report.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`} data-testid="chain-result">
      <p className="font-medium flex items-center gap-2 text-gray-900">
        {report.ok
          ? <CheckCircle2 className="w-4 h-4 text-green-700" aria-hidden="true" />
          : <AlertTriangle className="w-4 h-4 text-red-700" aria-hidden="true" />}
        {title}: {report.ok ? 'intact' : 'BROKEN'}
      </p>
      <p className="text-xs text-gray-700 mt-1">
        {report.checked} entr{report.checked === 1 ? 'y' : 'ies'} recomputed
        {report.last_no != null && <> · last entry no. {report.last_no}</>}
        {report.legacy_rows > 0 && <> · {report.legacy_rows} entr{report.legacy_rows === 1 ? 'y' : 'ies'} from before Sprint 38 (not chained)</>}
        {!report.complete && report.next_from != null && <> · stopped at the limit; continue from no. {report.next_from}</>}
      </p>
      {report.first_break && (
        <p className="text-xs text-red-800 mt-1">
          First broken entry{report.first_break.no != null ? ` no. ${report.first_break.no}` : ''}: {report.first_break.problem}
        </p>
      )}
      {report.ok && report.head_hash && (
        <p className="text-[11px] text-gray-600 mt-1 break-all">
          Latest hash <span className="font-mono">{report.head_hash}</span> — note it down: a later check must still contain it.
        </p>
      )}
    </div>
  );
}
