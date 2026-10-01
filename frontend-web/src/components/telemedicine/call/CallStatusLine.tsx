'use client';
import { Loader2 } from 'lucide-react';
import { statusText, type CallStatus } from '@/lib/telemedicine/callStatus';
import type { JoinInfo } from '@/lib/telemedicine/types';

/** connecting / waiting for the other person / connected / ended / errors */
export default function CallStatusLine({ status, role, message }: { status: CallStatus; role: JoinInfo['role']; message: string | null }) {
  const busy = status === 'connecting' || status === 'waiting' || status === 'reconnecting';
  const tone = status === 'error' ? 'text-red-300' : status === 'connected' ? 'text-green-300' : 'text-gray-200';
  return (
    <div className="text-center py-2" aria-live="polite">
      <p className={`text-sm inline-flex items-center gap-2 ${tone}`}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {statusText(status, role)}
      </p>
      {message && (
        <p role={status === 'error' ? 'alert' : undefined} className="text-xs text-amber-200 mt-1">
          {message}
        </p>
      )}
    </div>
  );
}
