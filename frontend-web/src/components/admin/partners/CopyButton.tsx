'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Copies text to the clipboard (nothing is stored by the website). */
export default function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="btn-outline text-xs py-1.5 px-2.5 inline-flex items-center gap-1 whitespace-nowrap"
      aria-label={label}
    >
      {copied ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
