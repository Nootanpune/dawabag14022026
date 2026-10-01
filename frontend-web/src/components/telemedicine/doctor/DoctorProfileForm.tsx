'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { doctorKeys, saveMyProfile } from '@/lib/telemedicine/doctorApi';
import { buildProfileBody, type ProfileFormValues } from '@/lib/telemedicine/profileForm';
import { getApiErrorLines } from '@/lib/apiErrors';
import ErrorLines from '../common/ErrorLines';

type Key = keyof ProfileFormValues;

const FIELDS: { key: Key; label: string; hint?: string; type?: string; wide?: boolean; area?: boolean }[] = [
  { key: 'full_name', label: 'Full name (as on the council register)' },
  { key: 'qualification', label: 'Qualification', hint: 'e.g. MBBS, MD (General Medicine)' },
  { key: 'council', label: 'Council', hint: 'National Medical Commission or e.g. Maharashtra Medical Council' },
  { key: 'nmc_reg_number', label: 'Registration number' },
  { key: 'registration_year', label: 'Year of registration', type: 'number' },
  { key: 'speciality', label: 'Speciality (optional)' },
  { key: 'clinic_name', label: 'Clinic / hospital (optional)' },
  { key: 'fee_rupees', label: 'Consultation fee (₹)', type: 'number' },
  { key: 'languages', label: 'Languages (comma separated)', wide: true },
  { key: 'bio', label: 'About you (optional)', wide: true, area: true },
];

/** Registration details (C-22). Changing name, qualification, council or number sends the profile back for checking. */
export default function DoctorProfileForm({ initial }: { initial: ProfileFormValues }) {
  const queryClient = useQueryClient();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const save = useMutation({
    mutationFn: saveMyProfile,
    onSuccess: (r) => {
      setErrors([]);
      toast.success(r.message);
    },
    onError: (err) => setErrors(getApiErrorLines(err, 'Could not save the profile')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: doctorKeys.all }),
  });

  const submit = () => {
    const { body, problems } = buildProfileBody(v);
    setErrors(problems);
    if (body) save.mutate(body);
  };

  return (
    <div className="card space-y-4 text-sm">
      <div className="grid sm:grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className={`block font-medium text-gray-700 ${f.wide ? 'sm:col-span-2' : ''}`}>
            {f.label}
            {f.area ? (
              <textarea
                value={v[f.key]}
                onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                rows={3}
                maxLength={2000}
                className="input mt-1"
              />
            ) : (
              <input
                type={f.type ?? 'text'}
                value={v[f.key]}
                onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                className="input mt-1"
              />
            )}
            {f.hint && <span className="block text-xs font-normal text-gray-400 mt-0.5">{f.hint}</span>}
          </label>
        ))}
      </div>
      <ErrorLines lines={errors} />
      <div className="flex justify-end">
        <button onClick={submit} disabled={save.isPending} className="btn-primary inline-flex items-center gap-2">
          {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save profile
        </button>
      </div>
    </div>
  );
}
