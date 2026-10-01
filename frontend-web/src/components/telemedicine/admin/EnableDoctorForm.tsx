'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { adminDoctorKeys, enableDoctor } from '@/lib/telemedicine/adminApi';
import { getApiErrorMessage } from '@/lib/apiErrors';

/** Lets a registered patient account sign in as a teleconsultation doctor. The doctor then fills in the registration. */
export default function EnableDoctorForm() {
  const queryClient = useQueryClient();
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const enable = useMutation({
    mutationFn: enableDoctor,
    onSuccess: () => {
      toast.success(`+91 ${mobile} can now sign in to the doctor portal and submit a registration`);
      setMobile('');
      setError('');
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not enable the doctor login')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminDoctorKeys.all }),
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[6-9]\d{9}$/.test(mobile)) return setError('Enter the 10-digit mobile number of an existing account');
    enable.mutate(mobile);
  };
  return (
    <form onSubmit={submit} className="card text-sm mb-4">
      <p className="font-medium mb-2">Enable a doctor login</p>
      <div className="flex flex-wrap gap-2 items-start">
        <div>
          <input
            value={mobile}
            onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
            inputMode="numeric"
            placeholder="Mobile number"
            className="input max-w-[12rem]"
          />
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
        <button type="submit" disabled={enable.isPending} className="btn-primary text-sm inline-flex items-center gap-1">
          {enable.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Enable
        </button>
      </div>
      <p className="text-xs text-gray-500 mt-2">The account must already exist as a patient account; staff and partner logins cannot be used.</p>
    </form>
  );
}
