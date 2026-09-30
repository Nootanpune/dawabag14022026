import type { ReactNode } from 'react';
import StatusBadge from '../StatusBadge';

export default function DecisionCard({ title, result, children }: { title: string; result: string; children: ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        <StatusBadge status={result} />
      </div>
      {children}
    </div>
  );
}
