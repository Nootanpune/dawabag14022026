import { MessageSquareOff } from 'lucide-react';
import Link from 'next/link';

/** Sprint 40: shown instead of the "code sent" step when the server cannot send text messages. */
export default function SmsUnavailableNotice({ message, showPasswordLink = false }: { message: string; showPasswordLink?: boolean }) {
  return (
    <div className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3" role="alert" data-testid="sms-unavailable">
      <MessageSquareOff className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
      <div>
        <p>{message}</p>
        {showPasswordLink && <Link href="/auth/login" className="font-medium text-brand-700 hover:underline">Sign in with your password</Link>}
      </div>
    </div>
  );
}
