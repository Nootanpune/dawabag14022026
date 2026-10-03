'use client';
import { useState } from 'react';
import { Copy, Printer } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Ten one-time recovery codes, shown once (Sprint 42). Copy or print them — the website
 * never saves them anywhere (server is the single source of truth; the server keeps only
 * their hashes). The person confirms they have kept them before going on.
 */
export default function RecoveryCodes({ codes, onDone, doneLabel = 'Continue' }: { codes: string[]; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      toast.success('Codes copied');
    } catch {
      toast.error('Could not copy; write them down instead');
    }
  };
  return (
    <div className="space-y-3" data-testid="recovery-codes">
      <div>
        <h2 className="font-semibold text-gray-900">Your recovery codes</h2>
        <p className="text-sm text-gray-600 mt-1">
          If you lose your phone, each code signs you in once instead of the authenticator code. Keep them somewhere safe
          and private (printed, or in a password manager). They are shown only now.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2 font-mono text-sm bg-gray-50 border border-gray-200 rounded-xl p-3" aria-label="Recovery codes">
        {codes.map((c) => <li key={c} className="text-center tracking-wider">{c}</li>)}
      </ul>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className="btn-outline text-sm flex-1 inline-flex items-center justify-center gap-1.5">
          <Copy className="w-4 h-4" aria-hidden="true" /> Copy
        </button>
        <button type="button" onClick={() => window.print()} className="btn-outline text-sm flex-1 inline-flex items-center justify-center gap-1.5">
          <Printer className="w-4 h-4" aria-hidden="true" /> Print
        </button>
      </div>
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5" />
        I have kept these codes somewhere safe
      </label>
      <button type="button" disabled={!saved} onClick={onDone} className="btn-primary w-full py-2.5 disabled:opacity-50">{doneLabel}</button>
    </div>
  );
}
