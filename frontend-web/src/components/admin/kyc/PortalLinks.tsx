import { ExternalLink } from 'lucide-react';
import type { KycApplication } from '@/lib/admin/kyc';

const LABELS: Record<string, string> = {
  drug_license: 'State drug licence register',
  nmc: 'NMC Indian Medical Register',
  gstin: 'GST taxpayer search',
  pan: 'Income Tax PAN verification',
};

export default function PortalLinks({ links }: { links: KycApplication['portal_links'] }) {
  const entries = Object.entries(links ?? {}).filter(([, url]) => !!url);
  if (entries.length === 0) return null;
  return (
    <div className="card">
      <h3 className="text-sm font-semibold mb-3">Verification portals</h3>
      <ul className="space-y-1.5 text-sm">
        {entries.map(([key, url]) => (
          <li key={key}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:underline inline-flex items-center gap-1"
            >
              {LABELS[key] ?? key} <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
