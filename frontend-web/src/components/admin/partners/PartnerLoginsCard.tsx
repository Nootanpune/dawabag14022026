'use client';
import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import type { PartnerLogin } from '@/lib/admin/partnerOnboarding';
import { formatDateTimeIST } from '@/lib/dates';
import AddLoginDialog from './AddLoginDialog';

/** The partner's portal logins: who has changed their temporary password, last sign-in. */
export default function PartnerLoginsCard({ vendorId, logins }: { vendorId: string; logins: PartnerLogin[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="card text-sm" aria-label="Logins">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Logins</h2>
        <button type="button" onClick={() => setAdding(true)} className="btn-outline text-xs py-1.5 px-3 inline-flex items-center gap-1">
          <UserPlus className="w-4 h-4" aria-hidden="true" /> Add login
        </button>
      </div>
      {logins.length ? (
        <ul className="mt-3 divide-y divide-gray-100">
          {logins.map((l) => (
            <li key={l.user_id} className="py-2 flex flex-wrap gap-x-3 gap-y-1 items-center">
              <span className="font-medium">+91 {l.mobile}</span>
              <span className="text-gray-500">{l.full_name ?? ''}</span>
              <span className={`ml-auto text-xs ${l.must_change_password ? 'text-amber-700' : 'text-green-700'}`}>
                {l.must_change_password ? 'Has not yet changed the temporary password' : 'Own password set'}
              </span>
              <span className="w-full text-xs text-gray-500">
                {l.last_login_at ? `Last signed in ${formatDateTimeIST(l.last_login_at)}` : 'Never signed in'}
                {!l.is_active && ' · login switched off'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-500 mt-2">No logins yet.</p>
      )}
      {adding && <AddLoginDialog vendorId={vendorId} onClose={() => setAdding(false)} />}
    </section>
  );
}
