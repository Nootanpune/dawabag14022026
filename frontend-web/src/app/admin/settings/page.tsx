'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DLT_TEMPLATES_KEY, fetchSettings, SETTING_KINDS, settingsKeys, type AppSetting } from '@/lib/admin/settings';
import { useAuthStore } from '@/store/authStore';
import PageHeader from '@/components/admin/PageHeader';
import QueryState from '@/components/admin/QueryState';
import SettingValue from '@/components/admin/settings/SettingValue';
import SettingEditor from '@/components/admin/settings/SettingEditor';
import SettingSwitch from '@/components/admin/settings/SettingSwitch';
import DltTemplatesSection from '@/components/admin/settings/DltTemplatesSection';
import RetentionSection from '@/components/admin/settings/RetentionSection';
import { RETENTION_KEY } from '@/lib/admin/retention';
import LegalSettingsSection from '@/components/admin/legal/LegalSettingsSection';
import PharmacistRegistrationSection from '@/components/admin/legal/PharmacistRegistrationSection';
import { isLegalKey } from '@/lib/admin/legalSettings';
import AccountsLockSection from '@/components/admin/settings/AccountsLockSection';
import WhatsAppTemplatesSection from '@/components/admin/settings/WhatsAppTemplatesSection';
import { ACCOUNTS_LOCK_KEY } from '@/lib/admin/accountsLock';
import { WHATSAPP_TEMPLATES_KEY } from '@/lib/admin/whatsappTemplates';
import { formatDateTimeIST } from '@/lib/dates';
import RxHoldSection, { RX_HOLD_KEY } from '@/components/admin/settings/RxHoldSection';

// Edited in their own sections below, not the generic list
const OWN_SECTION_KEYS = [DLT_TEMPLATES_KEY, RETENTION_KEY, ACCOUNTS_LOCK_KEY, WHATSAPP_TEMPLATES_KEY, RX_HOLD_KEY,
  // Sprint 39 one-time migration markers (nothing to edit)
  'pharmacist_registration.backfilled', 'pharmacist_registration.partner_backfilled'];

export default function AdminSettingsPage() {
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'super_admin');
  const [editing, setEditing] = useState<AppSetting | null>(null);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: settingsKeys.all,
    queryFn: fetchSettings,
  });
  const meta = editing ? SETTING_KINDS[editing.key] : undefined;
  // legal.* objects, SMS / WhatsApp templates, retention periods and the GST lock get their own forms below
  const rules = data?.filter((s) => !isLegalKey(s.key) && !OWN_SECTION_KEYS.includes(s.key));

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle={isSuperAdmin ? 'Business rules held on the server' : 'Only a super admin can change these'}
        onRefresh={() => refetch()}
        refreshing={isFetching}
      />
      <QueryState isLoading={isLoading} error={error} isEmpty={!data?.length} emptyText="No settings" />
      {!!rules?.length && (
        <div className="card p-0 divide-y divide-gray-100">
          {rules.map((s) => {
            const m = SETTING_KINDS[s.key];
            return (
              <div key={s.key} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{m?.label ?? s.key}</p>
                  <p className="text-xs text-gray-400">
                    {/* Sprint 43 (QA): the plain-English hint first; the server's note otherwise */}
                    {m?.hint ?? s.description ?? ''}
                  </p>
                  <p className="text-xs text-gray-400">Updated {formatDateTimeIST(s.updated_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">
                    <SettingValue kind={m?.kind} value={s.value} unit={m?.unit} options={m?.options} />
                  </span>
                  {m?.kind === 'boolean' && <SettingSwitch setting={s} meta={m} canEdit={isSuperAdmin} />}
                  {isSuperAdmin && m && m.kind !== 'boolean' && (
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
      {/* Sprint 13 — GST period lock (C-31) and WhatsApp templates (C-42) */}
      {!!data?.length && <AccountsLockSection setting={data.find((s) => s.key === ACCOUNTS_LOCK_KEY)} canEdit={isSuperAdmin} />}
      {!!data?.length && <DltTemplatesSection setting={data.find((s) => s.key === DLT_TEMPLATES_KEY)} canEdit={isSuperAdmin} />}
      {!!data?.length && <WhatsAppTemplatesSection setting={data.find((s) => s.key === WHATSAPP_TEMPLATES_KEY)} canEdit={isSuperAdmin} />}
      {!!data?.length && <RetentionSection setting={data.find((s) => s.key === RETENTION_KEY)} canEdit={isSuperAdmin} />}
      {!!data?.length && <RxHoldSection setting={data.find((s) => s.key === RX_HOLD_KEY)} canEdit={isSuperAdmin} />}
      {!!data?.length && <LegalSettingsSection settings={data} canEdit={isSuperAdmin} />}
      <PharmacistRegistrationSection />
      {editing && meta && (
        <SettingEditor setting={editing} meta={meta} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
