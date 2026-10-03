'use client';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchUsersByRole, setPharmacistRegNo } from '@/lib/fulfilment/api';
import { getApiErrorMessage } from '@/lib/apiErrors';

// A pharmacist login needs a pharmacy-council registration number before it
// can verify prescriptions (C-03, C-08). Admin / super admin only.
export default function PharmacistRegistrationSection() {
  const [userId, setUserId] = useState('');
  const [regNo, setRegNo] = useState('');
  const pharmacists = useQuery({
    queryKey: ['admin', 'users', 'pharmacists'],
    queryFn: async () => [...(await fetchUsersByRole('pharmacist_rx')), ...(await fetchUsersByRole('pharmacist_pack'))],
  });
  const save = useMutation({
    mutationFn: () => setPharmacistRegNo(userId, regNo.trim()),
    onSuccess: () => {
      toast.success('Registration number saved');
      setRegNo('');
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not save')),
  });

  return (
    <section className="mt-6">
      <h2 className="text-base font-semibold mb-2">Pharmacist registration</h2>
      <div className="card">
        <p className="text-xs text-gray-500 mb-3">
          Pharmacists must have their pharmacy council registration number on file before reviewing prescriptions.
          Record the council, valid-till date and verification in{' '}
          <a href="/admin/pharmacist-registrations" className="text-brand-700 underline">Pharmacist registrations</a> (Sprint 39): a changed number must be verified again.
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
          <label className="block text-sm">
            <span className="block font-medium text-gray-700 mb-1">Pharmacist</span>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="input">
              <option value="">{pharmacists.isLoading ? 'Loading…' : 'Select a pharmacist'}</option>
              {pharmacists.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name ?? u.mobile} ({u.role === 'pharmacist_rx' ? 'Rx' : 'packing'})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="block font-medium text-gray-700 mb-1">Registration no.</span>
            <input value={regNo} onChange={(e) => setRegNo(e.target.value)} maxLength={50} className="input" />
          </label>
          <button
            onClick={() => save.mutate()}
            disabled={!userId || regNo.trim().length < 3 || save.isPending}
            className="btn-primary text-sm"
          >
            Save
          </button>
        </div>
      </div>
    </section>
  );
}
