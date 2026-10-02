'use client';
import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { PASSWORD_RULES, passwordProblem } from '@/lib/auth/password';
import type { AuthResponseData } from '@/lib/session';
import api from '@/lib/api';

interface Props {
  mobile?: string;
  onChanged: (session: AuthResponseData) => void;
}

/** Current password, new password twice; the server checks and issues a new session. */
export default function ChangePasswordForm({ mobile, onChanged }: Props) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = !current ? 'Enter your current password' : passwordProblem(next, mobile)
      || (next !== again ? 'The two new passwords are not the same' : '')
      || (next === current ? 'Choose a new password that is different from the current one' : '');
    if (problem) return setError(problem);
    setError('');
    setPending(true);
    try {
      const { data } = await api.post('/auth/change-password', { current_password: current, new_password: next });
      onChanged(data.data as AuthResponseData);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not change the password'));
    } finally {
      setPending(false);
    }
  };

  const type = show ? 'text' : 'password';
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <label className="block text-sm">
        <span className="block font-medium text-gray-700 mb-1">Current password (the temporary one you were given)</span>
        <input type={type} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" className="input" />
      </label>
      <div className="text-sm">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">New password</span>
          <input type={type} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" className="input"
            aria-describedby="password-rules" />
        </label>
        <span id="password-rules" className="block text-xs text-gray-500 mt-1">{PASSWORD_RULES}</span>
      </div>
      <label className="block text-sm">
        <span className="block font-medium text-gray-700 mb-1">New password again</span>
        <input type={type} value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" className="input" />
      </label>
      <button type="button" onClick={() => setShow((s) => !s)} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
        {show ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
        {show ? 'Hide passwords' : 'Show passwords'}
      </button>
      {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2">
        {pending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        Save new password
      </button>
    </form>
  );
}
