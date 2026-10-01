'use client';
import { useState } from 'react';
import type { AppSetting } from '@/lib/admin/settings';
import { labelOf, toDltRows } from '@/lib/admin/dltTemplates';
import { formatDateTimeIST } from '@/lib/admin/format';
import DltTemplatesEditor from './DltTemplatesEditor';

/** Read-only list of SMS DLT templates; super admin edits them in a table dialog. */
export default function DltTemplatesSection({ setting, canEdit }: { setting: AppSetting | undefined; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const rows = toDltRows(setting?.value);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
        <div>
          <h2 className="text-base font-semibold">SMS templates (DLT)</h2>
          <p className="text-xs text-gray-500">
            Indian operators deliver only DLT-registered templates, so a message type without a template is not sent by SMS (it is logged as skipped).
          </p>
        </div>
        {canEdit && setting && (
          <button onClick={() => setEditing(true)} className="btn-outline text-xs py-1.5 px-3">
            Edit
          </button>
        )}
      </div>
      <div className="card p-0 overflow-x-auto">
        {!setting ? (
          <p className="text-sm text-gray-400 px-4 py-3">Missing on server</p>
        ) : !rows.length ? (
          <p className="text-sm text-gray-400 px-4 py-3">No templates set — no SMS is sent</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                <th className="font-medium px-4 py-2.5">Message type</th>
                <th className="font-medium px-4 py-2.5">Template id</th>
                <th className="font-medium px-4 py-2.5">Variables</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.type} className="border-b border-gray-50">
                  <td className="px-4 py-2.5">{labelOf(r.type)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.template_id}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {r.vars.map((v) => `${v.name} = ${labelOf(v.ours)}`).join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {setting && <p className="text-xs text-gray-400 mt-1">Updated {formatDateTimeIST(setting.updated_at)}</p>}
      {editing && <DltTemplatesEditor value={setting?.value} onClose={() => setEditing(false)} />}
    </section>
  );
}
