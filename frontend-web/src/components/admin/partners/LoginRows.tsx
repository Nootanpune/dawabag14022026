'use client';
import { useEffect } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { generateTemporaryPassword } from '@/lib/auth/password';
import type { LoginRow } from '@/lib/admin/partnerOnboarding';
import CopyButton from './CopyButton';
import FormSection from './FormSection';

interface Props {
  rows: LoginRow[];
  onChange: (rows: LoginRow[]) => void;
}

export const newLoginRow = (): LoginRow => ({ mobile: '', full_name: '', temporary_password: generateTemporaryPassword() });

/**
 * Portal logins: one row per mobile number. Each gets a temporary password made here;
 * the person must change it at first sign-in. A mobile already used by a customer
 * account is refused by the server — use a separate number.
 */
export default function LoginRows({ rows, onChange }: Props) {
  const update = (i: number, patch: Partial<LoginRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // The first row (and its password) is made in the browser, never in the page's HTML
  useEffect(() => {
    if (!rows.length) onChange([newLoginRow()]);
  }, [rows.length, onChange]);
  return (
    <FormSection title="Logins" hint={<>Who will sign in to the partner portal. Give each person their temporary password; <strong>they must change it at first login</strong>.</>}>
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="border border-gray-200 rounded-lg p-3 grid sm:grid-cols-[1fr_1fr_1.3fr_auto] gap-3 items-end">
            <label className="block">
              <span className="block font-medium text-gray-700 mb-1">Login {i + 1} — mobile</span>
              <input value={r.mobile} onChange={(e) => update(i, { mobile: e.target.value.replace(/\D/g, '') })} className="input"
                inputMode="numeric" maxLength={10} placeholder="10 digits" />
            </label>
            <label className="block">
              <span className="block font-medium text-gray-700 mb-1">Login {i + 1} — person&apos;s name</span>
              <input value={r.full_name} onChange={(e) => update(i, { full_name: e.target.value })} className="input" maxLength={200} />
            </label>
            <div>
              <span className="block font-medium text-gray-700 mb-1" id={`login-${i}-pw`}>Login {i + 1} — temporary password</span>
              <div className="flex gap-2 items-center">
                <code aria-labelledby={`login-${i}-pw`} className="font-mono text-sm bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 flex-1 break-all">
                  {r.temporary_password}
                </code>
                <button type="button" onClick={() => update(i, { temporary_password: generateTemporaryPassword() })}
                  className="btn-outline py-1.5 px-2" aria-label={`New temporary password for login ${i + 1}`}>
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <CopyButton text={r.temporary_password} label={`Copy temporary password for login ${i + 1}`} />
              </div>
            </div>
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}
              className="btn-outline py-2 px-3 disabled:opacity-40" aria-label={`Remove login ${i + 1}`}>
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...rows, newLoginRow()])}
          className="btn-outline text-xs py-1.5 px-3 inline-flex items-center gap-1">
          <Plus className="w-4 h-4" aria-hidden="true" /> Add another login
        </button>
      </div>
    </FormSection>
  );
}
