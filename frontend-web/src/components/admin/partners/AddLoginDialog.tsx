'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addPartnerLogin, partnerKeys } from '@/lib/admin/partnerOnboarding';
import { generateTemporaryPassword } from '@/lib/auth/password';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '../Modal';
import DialogActions from '../DialogActions';
import CopyButton from './CopyButton';
import TemporaryPasswords, { type IssuedLogin } from './TemporaryPasswords';

/** One more partner login: mobile, name, a temporary password shown once. */
export default function AddLoginDialog({ vendorId, onClose }: { vendorId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<IssuedLogin | null>(null);
  useEffect(() => setPassword(generateTemporaryPassword()), []);

  const add = useMutation({
    mutationFn: () => addPartnerLogin(vendorId, { mobile, full_name: name.trim() || null, temporary_password: password }),
    onSuccess: (r) => {
      setIssued({ mobile: r.mobile, name, password: r.temporary_password_set ? password : null });
      queryClient.invalidateQueries({ queryKey: partnerKeys.detail(vendorId) });
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not add the login')),
  });

  const submit = () => {
    if (!/^[6-9]\d{9}$/.test(mobile)) return setError('Enter a valid 10-digit mobile number');
    setError('');
    add.mutate();
  };

  return (
    <Modal title="Add a partner login" onClose={onClose} size="lg">
      {issued ? (
        <>
          <TemporaryPasswords logins={[issued]} />
          <div className="flex justify-end mt-4">
            <button type="button" onClick={onClose} className="btn-primary px-4 py-2">Done</button>
          </div>
        </>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">Use a mobile number that is not already a Dawabag customer account.</p>
          <label className="block">
            <span className="block font-medium text-gray-700 mb-1">Mobile</span>
            <input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} maxLength={10} inputMode="numeric"
              className="input" autoFocus />
          </label>
          <label className="block">
            <span className="block font-medium text-gray-700 mb-1">Person&apos;s name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className="input" />
          </label>
          <div>
            <span className="block font-medium text-gray-700 mb-1">Temporary password</span>
            <div className="flex gap-2 items-center">
              <code className="font-mono bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 flex-1">{password}</code>
              <CopyButton text={password} label="Copy temporary password" />
            </div>
            <p className="text-xs text-gray-500 mt-1">They must change it at first login.</p>
          </div>
          <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Add login" pending={add.isPending} error={error} />
        </div>
      )}
    </Modal>
  );
}
