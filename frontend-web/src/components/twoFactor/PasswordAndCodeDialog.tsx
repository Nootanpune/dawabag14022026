'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Modal from '@/components/admin/Modal';

/** Asks for the password and a current code (or a recovery code) before a two-step sign-in change (Sprint 42). */
export default function PasswordAndCodeDialog({ title, intro, confirmLabel, danger, pending, error, onClose, onConfirm }: {
  title: string; intro: string; confirmLabel: string; danger?: boolean; pending?: boolean; error?: string | null;
  onClose: () => void; onConfirm: (password: string, code: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); onConfirm(password, code); }} className="space-y-3" noValidate>
        <p className="text-sm text-gray-600">{intro}</p>
        <div>
          <label htmlFor="tf-password" className="block text-sm font-medium text-gray-700 mb-1">Your password</label>
          <input id="tf-password" type="password" autoComplete="current-password" className="input" value={password}
            onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
        <div>
          <label htmlFor="tf-code" className="block text-sm font-medium text-gray-700 mb-1">Code from the app (or a recovery code)</label>
          <input id="tf-code" type="text" autoComplete="one-time-code" className="input font-mono" value={code} maxLength={11}
            onChange={(e) => setCode(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-outline text-sm">Cancel</button>
          <button type="submit" disabled={pending || !password || !code.trim()}
            className={`${danger ? 'bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium' : 'btn-primary'} text-sm inline-flex items-center gap-2 disabled:opacity-50`}>
            {pending && <Loader2 className="w-4 h-4 animate-spin" />} {confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
