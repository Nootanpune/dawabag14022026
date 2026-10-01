'use client';
import { cn } from '@/lib/utils';
import { deadlineLeft } from '@/lib/recallAlerts/time';
import { useNow } from './useNow';

/**
 * Deadline pill: C-28 gives 4 hours from receipt to recall or clear every match.
 * Computed live from due_at; once nothing is pending there is no deadline to show.
 */
export default function DeadlineBadge({ dueAt, pending, matches }: { dueAt: string; pending: number; matches: number }) {
  const now = useNow();
  if (!pending) {
    return (
      <span className="inline-block text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap bg-gray-100 text-gray-600">
        {matches ? 'All decided' : 'Nothing held'}
      </span>
    );
  }
  const left = deadlineLeft(dueAt, now);
  return (
    <span
      className={cn(
        'inline-block text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap',
        left.overdue ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'
      )}
    >
      {left.text}
    </span>
  );
}
