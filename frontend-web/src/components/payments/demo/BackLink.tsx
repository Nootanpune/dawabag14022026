import { ArrowLeft } from 'lucide-react';

/** "Change method" / "Back" in the demo checkout (Escape does the same). */
export default function BackLink({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline disabled:opacity-50">
      <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {label}
    </button>
  );
}
