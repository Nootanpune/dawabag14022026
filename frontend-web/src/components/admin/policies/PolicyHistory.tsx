import type { PolicyKey, PolicyVersion } from '@/lib/legal/policies';
import { formatDateIST, formatDateTimeIST } from '@/lib/admin/format';

/** Every published version (C-39); none is ever overwritten. */
export default function PolicyHistory({ docKey, versions }: { docKey: PolicyKey; versions: PolicyVersion[] }) {
  if (!versions.length) return <p className="text-sm text-gray-400">No version published yet.</p>;
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr className="text-left">
            <th className="font-medium px-4 py-2">Version</th>
            <th className="font-medium px-4 py-2">Title</th>
            <th className="font-medium px-4 py-2">Effective from</th>
            <th className="font-medium px-4 py-2">Lawyer reviewed</th>
            <th className="font-medium px-4 py-2">Published</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {versions.map((v) => (
            <tr key={v.version}>
              <td className="px-4 py-2">
                <a
                  href={`/policies/${docKey}?version=${v.version}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  v{v.version}
                </a>
              </td>
              <td className="px-4 py-2">{v.title}</td>
              <td className="px-4 py-2 text-xs">{formatDateIST(v.effective_from)}</td>
              <td className="px-4 py-2 text-xs">{v.lawyer_reviewed ? 'Yes' : <span className="text-amber-700">No</span>}</td>
              <td className="px-4 py-2 text-xs">{formatDateTimeIST(v.published_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
