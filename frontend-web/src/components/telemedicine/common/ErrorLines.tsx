import { AlertCircle } from 'lucide-react';

/** Server error shown one problem per line (422 refusals joined with '; '). */
export default function ErrorLines({ lines, title }: { lines: string[]; title?: string }) {
  if (!lines.length) return null;
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800" role="alert">
      <p className="font-medium flex items-center gap-1.5 mb-1">
        <AlertCircle className="w-4 h-4 shrink-0" /> {title ?? (lines.length > 1 ? 'Please fix the following' : 'Could not complete this')}
      </p>
      <ul className="list-disc pl-6 space-y-0.5">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
