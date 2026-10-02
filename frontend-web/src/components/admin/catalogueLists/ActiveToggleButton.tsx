'use client';
import { Loader2 } from 'lucide-react';

/** "Switch off" / "Switch on" for a list entry. */
export default function ActiveToggleButton({ active, pending, onClick, name }: { active: boolean; pending: boolean; onClick: () => void; name: string }) {
  return (
    <button type="button" onClick={onClick} disabled={pending}
      className="text-sm text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline inline-flex items-center gap-1 disabled:opacity-50"
      aria-label={`${active ? 'Switch off' : 'Switch on'} ${name}`}>
      {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {active ? 'Switch off' : 'Switch on'}
    </button>
  );
}
