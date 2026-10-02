'use client';
import { KeyRound } from 'lucide-react';
import CopyButton from './CopyButton';

export interface IssuedLogin { mobile: string; name: string; password: string | null }

/**
 * Shown once, straight after the logins are created: the temporary passwords live only
 * in this page's memory and are gone when the admin leaves it (never stored).
 */
export default function TemporaryPasswords({ logins }: { logins: IssuedLogin[] }) {
  return (
    <section className="card border-amber-300 bg-amber-50 text-sm" aria-label="Temporary passwords">
      <h2 className="text-base font-semibold flex items-center gap-2">
        <KeyRound className="w-4 h-4" aria-hidden="true" /> Temporary passwords — shown only now
      </h2>
      <p className="text-gray-700 mt-1">
        Copy each password and give it to that person privately (not in a group chat). They sign in at the Dawabag
        website with their mobile number and this password, and <strong>they must change it at first login</strong>.
        Dawabag does not keep a copy you can see later.
      </p>
      <ul className="mt-3 space-y-2">
        {logins.map((l) => (
          <li key={l.mobile} className="flex flex-wrap items-center gap-2 bg-white border border-amber-200 rounded-lg p-2">
            <span className="font-medium">+91 {l.mobile}</span>
            {l.name && <span className="text-gray-500">{l.name}</span>}
            {l.password ? (
              <>
                <code className="font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1 ml-auto" data-testid="temporary-password">{l.password}</code>
                <CopyButton text={l.password} label={`Copy temporary password for ${l.mobile}`} />
              </>
            ) : (
              <span className="ml-auto text-gray-600">Existing partner login linked — they keep their own password</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
