import { Lock } from 'lucide-react';

/**
 * A purchase document refused because its date falls in a GST period whose
 * returns are filed (accounts.locked_until, Sprint 13; C-31). The server's
 * message names the lock date; accounts can re-date or open the period.
 */
export default function LockedPeriodBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-300 rounded-lg p-3">
      <Lock className="w-4 h-4 mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">GST period closed</p>
        <p>{message}</p>
        <p className="text-xs text-amber-800 mt-1">Check the document date. If it is right, ask accounts — the returns for that period are already filed.</p>
      </div>
    </div>
  );
}
