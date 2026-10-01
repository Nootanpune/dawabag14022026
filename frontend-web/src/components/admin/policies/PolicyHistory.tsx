import { LANGUAGE_NAMES, type PolicyKey, type PolicyLanguage, type PolicyVersion } from '@/lib/legal/policies';
import { formatDateIST, formatDateTimeIST } from '@/lib/dates';

interface VersionGroup {
  version: number;
  /** the English row (title, effective date) — falls back to the first row */
  main: PolicyVersion;
  rows: PolicyVersion[];
}

/** The server returns one row per version per language (C-40); show one line per version. */
function groupByVersion(rows: PolicyVersion[]): VersionGroup[] {
  const groups = new Map<number, PolicyVersion[]>();
  rows.forEach((r) => groups.set(r.version, [...(groups.get(r.version) ?? []), r]));
  return Array.from(groups.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([version, list]) => ({ version, main: list.find((r) => (r.language ?? 'en') === 'en') ?? list[0], rows: list }));
}

/** Every published version (C-39) and its translations (C-40); none is ever overwritten. */
export default function PolicyHistory({ docKey, versions }: { docKey: PolicyKey; versions: PolicyVersion[] }) {
  if (!versions.length) return <p className="text-sm text-gray-400">No version published yet.</p>;
  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr className="text-left">
            <th className="font-medium px-4 py-2">Version</th>
            <th className="font-medium px-4 py-2">Title</th>
            <th className="font-medium px-4 py-2">Languages</th>
            <th className="font-medium px-4 py-2">Effective from</th>
            <th className="font-medium px-4 py-2">Lawyer reviewed</th>
            <th className="font-medium px-4 py-2">Published</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {groupByVersion(versions).map(({ version, main, rows }) => (
            <tr key={version}>
              <td className="px-4 py-2">
                <a
                  href={`/policies/${docKey}?version=${version}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  v{version}
                </a>
              </td>
              <td className="px-4 py-2">{main.title}</td>
              <td className="px-4 py-2 text-xs space-x-2">
                {rows.map((r) => {
                  const lang: PolicyLanguage = r.language ?? 'en';
                  return (
                    <a
                      key={lang}
                      href={`/policies/${docKey}?version=${version}${lang === 'en' ? '' : `&lang=${lang}`}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-700 hover:underline"
                      title={r.lawyer_reviewed ? 'Lawyer reviewed' : 'Not lawyer reviewed'}
                    >
                      {LANGUAGE_NAMES[lang]}
                      {!r.lawyer_reviewed && <span className="text-amber-700">*</span>}
                    </a>
                  );
                })}
              </td>
              <td className="px-4 py-2 text-xs">{formatDateIST(main.effective_from)}</td>
              <td className="px-4 py-2 text-xs">{main.lawyer_reviewed ? 'Yes' : <span className="text-amber-700">No</span>}</td>
              <td className="px-4 py-2 text-xs">{formatDateTimeIST(main.published_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {versions.some((v) => !v.lawyer_reviewed && (v.language ?? 'en') !== 'en') && (
        <p className="px-4 py-2 text-xs text-gray-400">* translation not reviewed by a lawyer</p>
      )}
    </div>
  );
}
