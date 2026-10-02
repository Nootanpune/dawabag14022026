import { formatDateTimeIST } from '@/lib/dates';
import { STATUS_LABEL, type InfoVersion } from '@/lib/medicineInfo/types';

/** Every version of this product's medicine information, newest first (C-46). */
export default function VersionHistory({ versions }: { versions: InfoVersion[] }) {
  if (!versions.length) return null;
  return (
    <section className="card text-sm" aria-labelledby="mi-history">
      <h2 id="mi-history" className="font-semibold mb-2">Versions</h2>
      <ul className="divide-y divide-gray-100">
        {versions.map((v) => (
          <li key={v.id} className="py-2 flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="font-medium">v{v.version}</span>
            <span>{STATUS_LABEL[v.status]}</span>
            <span className="text-gray-500">saved {formatDateTimeIST(v.updated_at)}{v.updated_by_name ? ` by ${v.updated_by_name}` : ''}</span>
            {v.reviewed_at && (
              <span className="text-gray-500">reviewed {formatDateTimeIST(v.reviewed_at)}{v.reviewer_name ? ` by ${v.reviewer_name}` : ''}</span>
            )}
            {v.review_notes && <span className="w-full text-xs text-gray-600">Note: {v.review_notes}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
