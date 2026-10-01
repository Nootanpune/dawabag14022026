'use client';
import { Download, Loader2 } from 'lucide-react';
import { REPORT_LABELS } from '@/lib/admin/accounts';

interface Props {
  names: string[];
  name: string;
  from: string;
  to: string;
  onChange: (v: { name?: string; from?: string; to?: string }) => void;
  onDownload: () => void;
  downloading: boolean;
}

export default function ReportFilters({ names, name, from, to, onChange, onDownload, downloading }: Props) {
  return (
    <div className="card flex flex-wrap items-end gap-3 text-sm mb-4">
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">Report</span>
        <select value={name} onChange={(e) => onChange({ name: e.target.value })} className="input">
          {names.map((n) => (
            <option key={n} value={n}>
              {REPORT_LABELS[n] ?? n}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">From</span>
        <input type="date" value={from} onChange={(e) => onChange({ from: e.target.value })} className="input" />
      </label>
      <label className="block">
        <span className="block font-medium text-gray-700 mb-1">To</span>
        <input type="date" value={to} onChange={(e) => onChange({ to: e.target.value })} className="input" />
      </label>
      <button onClick={onDownload} disabled={downloading || !name} className="btn-outline text-sm inline-flex items-center gap-1 ml-auto">
        {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download CSV
      </button>
    </div>
  );
}
