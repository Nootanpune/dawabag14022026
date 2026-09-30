import { AlertTriangle } from 'lucide-react';
import { DOCUMENT_LABELS, type DocumentType } from '@/lib/registration';

export default function KycWarnings({ licenceExpired, missing }: { licenceExpired: boolean; missing: string[] }) {
  if (!licenceExpired && missing.length === 0) return null;
  return (
    <div className="space-y-2">
      {licenceExpired && (
        <p className="flex items-start gap-2 text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          The drug licence has expired. The account cannot be activated until a valid licence is on file.
        </p>
      )}
      {missing.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          Missing documents: {missing.map((d) => DOCUMENT_LABELS[d as DocumentType] ?? d).join(', ')}
        </p>
      )}
    </div>
  );
}
