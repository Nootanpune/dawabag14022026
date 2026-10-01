import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: ReactNode;
}

export default function PageHeader({ title, subtitle, onRefresh, refreshing, actions }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
}
