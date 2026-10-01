import { Loader2, AlertCircle } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/apiErrors';

/** Loading / error / empty placeholder for admin lists. Returns null when there is data to show. */
export default function QueryState({
  isLoading,
  error,
  isEmpty,
  emptyText,
}: {
  isLoading: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyText: string;
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
        <AlertCircle className="w-4 h-4" /> {getApiErrorMessage(error, 'Could not load data')}
      </p>
    );
  }
  if (isEmpty) return <p className="text-center text-gray-400 text-sm py-10">{emptyText}</p>;
  return null;
}
