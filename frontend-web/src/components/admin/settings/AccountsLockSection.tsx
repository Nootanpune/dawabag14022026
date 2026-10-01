'use client';
import { useState } from 'react';
import { Lock, Unlock } from 'lucide-react';
import type { AppSetting } from '@/lib/admin/settings';
import { lockedUntil } from '@/lib/admin/accountsLock';
import { formatDateIST, formatDateTimeIST } from '@/lib/admin/format';
import AccountsLockEditor from './AccountsLockEditor';

/** accounts.locked_until — GST period lock on purchase-side documents (Sprint 13, C-31). */
export default function AccountsLockSection({ setting, canEdit }: { setting: AppSetting | undefined; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const locked = lockedUntil(setting?.value);
  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
        <div>
          <h2 className="text-base font-semibold">GST period lock</h2>
          <p className="text-xs text-gray-500">
            Purchase entries and supplier credit notes dated on or before this date are refused (returns already filed).
          </p>
        </div>
        {canEdit && setting && (
          <button onClick={() => setEditing(true)} className="btn-outline text-xs py-1.5 px-3">
            Edit
          </button>
        )}
      </div>
      <div className="card px-4 py-3 flex items-center justify-between gap-3 text-sm">
        <span>GST period locked up to</span>
        {!setting ? (
          <span className="text-gray-400">Missing on server</span>
        ) : locked ? (
          <span className="font-semibold inline-flex items-center gap-1">
            <Lock className="w-4 h-4 text-amber-600" /> {formatDateIST(locked)}
          </span>
        ) : (
          <span className="text-gray-500 inline-flex items-center gap-1">
            <Unlock className="w-4 h-4" /> Open — no period locked
          </span>
        )}
      </div>
      {setting && <p className="text-xs text-gray-400 mt-1">Updated {formatDateTimeIST(setting.updated_at)}</p>}
      {editing && <AccountsLockEditor value={setting?.value} onClose={() => setEditing(false)} />}
    </section>
  );
}
