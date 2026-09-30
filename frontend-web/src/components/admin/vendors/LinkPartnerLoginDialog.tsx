'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { linkPartnerLogin, type ApprovedVendor } from '@/lib/admin/partners';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '../Modal';
import DialogActions from '../DialogActions';

export default function LinkPartnerLoginDialog({ vendor, onClose }: { vendor: ApprovedVendor; onClose: () => void }) {
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');

  const link = useMutation({
    mutationFn: () => linkPartnerLogin(vendor.id, mobile),
    onSuccess: () => {
      toast.success(`+91 ${mobile} can now sign in to the ${vendor.name} partner portal`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not link login')),
  });

  const submit = () => {
    if (!/^[6-9]\d{9}$/.test(mobile)) return setError('Enter a valid 10-digit mobile number');
    setError('');
    link.mutate();
  };

  return (
    <Modal title={`Link partner login — ${vendor.name}`} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">
        The partner registers a normal Dawabag account first (a separate login from any buyer account). Enter its
        mobile number to turn it into this partner&apos;s portal login.
      </p>
      <label className="block text-sm font-medium text-gray-700 mb-1">Mobile number</label>
      <div className="flex">
        <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">
          +91
        </span>
        <input
          value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))}
          maxLength={10}
          inputMode="numeric"
          className="input rounded-l-none"
          autoFocus
        />
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Link login" pending={link.isPending} error={error} />
    </Modal>
  );
}
