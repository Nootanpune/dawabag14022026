'use client';
import { useState } from 'react';
import type { AppSetting } from '@/lib/admin/settings';
import { labelOf } from '@/lib/admin/dltTemplates';
import { toWaRows } from '@/lib/admin/whatsappTemplates';
import WhatsAppTemplatesEditor from './WhatsAppTemplatesEditor';
import { formatDateTimeIST } from '@/lib/dates';

/** Read-only list of WhatsApp templates (Sprint 13); super admin edits them in a table dialog. */
export default function WhatsAppTemplatesSection({ setting, canEdit }: { setting: AppSetting | undefined; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const rows = toWaRows(setting?.value);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
        <div>
          <h2 className="text-base font-semibold">WhatsApp templates</h2>
          <p className="text-xs text-gray-500">
            Order and refill updates are also sent on WhatsApp to buyers who opted in (C-42), using templates approved by Meta. A message type
            without a template is not sent on WhatsApp.
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
          <p className="text-sm text-gray-400 px-4 py-3">No templates set — nothing is sent on WhatsApp</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                <th className="font-medium px-4 py-2.5">Message type</th>
                <th className="font-medium px-4 py-2.5">Template</th>
                <th className="font-medium px-4 py-2.5">Language</th>
                <th className="font-medium px-4 py-2.5">Variables</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.type} className="border-b border-gray-50">
                  <td className="px-4 py-2.5">{labelOf(r.type)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.language}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-500">{r.vars.map((v, i) => `{{${i + 1}}} ${labelOf(v)}`).join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {setting && <p className="text-xs text-gray-400 mt-1">Updated {formatDateTimeIST(setting.updated_at)}</p>}
      {editing && <WhatsAppTemplatesEditor value={setting?.value} onClose={() => setEditing(false)} />}
    </section>
  );
}
