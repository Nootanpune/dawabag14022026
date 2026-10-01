'use client';
import { useState } from 'react';
import type { AppSetting } from '@/lib/admin/settings';
import { LEGAL_SETTINGS, type LegalSettingDef } from '@/lib/admin/legalSettings';
import LegalSettingEditor from './LegalSettingEditor';
import { formatDateTimeIST } from '@/lib/dates';

/** Legal details for the footer / invoices (C-04, C-36); super admin edits. */
export default function LegalSettingsSection({ settings, canEdit }: { settings: AppSetting[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<LegalSettingDef | null>(null);
  const byKey = new Map(settings.map((s) => [s.key, s]));

  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold mb-2">Legal details (site footer &amp; invoices)</h2>
      <div className="card p-0 divide-y divide-gray-100">
        {LEGAL_SETTINGS.map((def) => {
          const s = byKey.get(def.key);
          const v = (s?.value ?? {}) as Record<string, unknown>;
          const filled = def.fields.filter((f) => String(v[f.name] ?? '').trim()).length;
          return (
            <div key={def.key} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{def.title}</p>
                <p className="text-xs text-gray-500 truncate">
                  {def.fields.map((f) => String(v[f.name] ?? '').trim()).filter(Boolean).join(' · ') || 'Not set'}
                </p>
                <p className="text-xs text-gray-400">
                  {filled}/{def.fields.length} filled{s ? ` · updated ${formatDateTimeIST(s.updated_at)}` : ' · missing on server'}
                </p>
              </div>
              {canEdit && s && (
                <button onClick={() => setEditing(def)} className="btn-outline text-xs py-1.5 px-3">
                  Edit
                </button>
              )}
            </div>
          );
        })}
      </div>
      {editing && (
        <LegalSettingEditor def={editing} value={byKey.get(editing.key)?.value} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}
