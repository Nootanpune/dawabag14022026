'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSettings, SETTING_KINDS, settingsKeys, type AppSetting } from '@/lib/admin/settings';
import { formatDateTimeIST } from '@/lib/admin/format';
import { useAuthStore } from '@/store/authStore';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import SettingValue from '@/components/admin/settings/SettingValue';
import SettingEditor from '@/components/admin/settings/SettingEditor';

export default function AdminSettingsPage() {
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'super_admin');
  const [editing, setEditing] = useState<AppSetting | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: settingsKeys.all,
    queryFn: fetchSettings,
  });
  const meta = editing ? SETTING_KINDS[editing.key] : undefined;

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle={isSuperAdmin ? 'Business rules held on the server' : 'Only a super admin can change these'}
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No settings" />
      {!!data?.length && (
        <div className="card p-0 divide-y divide-gray-100">
          {data.map((s) => {
            const m = SETTING_KINDS[s.key];
            return (
              <div key={s.key} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{m?.label ?? s.key}</p>
                  <p className="text-xs text-gray-400">
                    <code>{s.key}</code>
                    {s.description ? ` — ${s.description}` : ''}
                  </p>
                  <p className="text-xs text-gray-400">Updated {formatDateTimeIST(s.updated_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">
                    <SettingValue kind={m?.kind} value={s.value} unit={m?.unit} />
                  </span>
                  {isSuperAdmin && m && (
                    <button onClick={() => setEditing(s)} className="btn-outline text-xs py-1.5 px-3">
                      Edit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing && meta && (
        <SettingEditor setting={editing} kind={meta.kind} label={meta.label} unit={meta.unit} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
