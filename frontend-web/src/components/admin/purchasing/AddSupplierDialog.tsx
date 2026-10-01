'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createSupplier, purchasingKeys } from '@/lib/purchasing/api';
import type { NewSupplier } from '@/lib/purchasing/types';
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/apiErrors';
import Modal from '../Modal';
import DialogActions from '../DialogActions';

const FIELDS: { key: keyof NewSupplier; label: string; required?: boolean; placeholder?: string }[] = [
  { key: 'name', label: 'Business name', required: true },
  { key: 'drug_license_no', label: 'Drug licence number', required: true },
  { key: 'gst_number', label: 'GSTIN', required: true, placeholder: '27ABCDE1234F1Z5' },
  { key: 'state', label: 'State', required: true },
  { key: 'city', label: 'City' },
  { key: 'contact_name', label: 'Contact person' },
  { key: 'contact_mobile', label: 'Contact mobile', placeholder: '10 digits' },
  { key: 'contact_email', label: 'Contact email' },
];

/** New supplier is saved as pending; it can be bought from only after licence approval (C-02). */
export default function AddSupplierDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: (body: NewSupplier) => createSupplier(body),
    onSuccess: (s) => {
      toast.success(`${s.name} added — approve the licence to start buying`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'vendors'] });
      onClose();
    },
    onError: (err) => {
      setFieldErrors(getApiFieldErrors(err));
      setError(getApiErrorMessage(err, 'Could not add the supplier'));
    },
  });

  const submit = () => {
    const missing = FIELDS.filter((f) => f.required && !form[f.key]?.trim());
    if (missing.length) return setError(`Required: ${missing.map((f) => f.label).join(', ')}`);
    const body = Object.fromEntries(
      Object.entries(form)
        .map(([k, v]) => [k, k === 'gst_number' ? v.trim().toUpperCase() : v.trim()])
        .filter(([, v]) => v)
    ) as unknown as NewSupplier;
    setError('');
    save.mutate(body);
  };

  return (
    <Modal title="Add supplier" onClose={onClose} size="lg">
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="block font-medium text-gray-700 mb-1">
              {f.label}
              {f.required && ' *'}
            </span>
            <input
              value={form[f.key] ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className="input"
            />
            {fieldErrors[f.key] && <span className="text-xs text-red-500">{fieldErrors[f.key]}</span>}
          </label>
        ))}
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Add supplier" pending={save.isPending} error={error} />
    </Modal>
  );
}
