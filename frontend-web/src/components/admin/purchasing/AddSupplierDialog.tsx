'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createSupplier, purchasingKeys, updateSupplier } from '@/lib/purchasing/api';
import type { NewSupplier, Supplier } from '@/lib/purchasing/types';
import { blankLicence, draftFromView, licenceBodies, licenceProblems, type LicenceDraft } from '@/lib/licences/forms';
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/apiErrors';
import { todayIST } from '@/lib/dates';
import LicenceRowsEditor from '@/components/licences/LicenceRowsEditor';
import Modal from '../Modal';
import DialogActions from '../DialogActions';

type Field = 'name' | 'gst_number' | 'state' | 'city' | 'contact_name' | 'contact_mobile' | 'contact_email';
const FIELDS: { key: Field; label: string; required?: boolean; placeholder?: string }[] = [
  { key: 'name', label: 'Business name', required: true },
  { key: 'gst_number', label: 'GSTIN', required: true, placeholder: '27ABCDE1234F1Z5' },
  { key: 'state', label: 'State', required: true },
  { key: 'city', label: 'City' },
  { key: 'contact_name', label: 'Contact person' },
  { key: 'contact_mobile', label: 'Contact mobile', placeholder: '10 digits' },
  { key: 'contact_email', label: 'Contact email' },
];

/**
 * Add a supplier / company, or edit one: business details and EVERY drug licence it holds —
 * wholesale 20B / 21B, manufacturing 25 / 28 (loan 25A / 28A, repacking 25B) or another named
 * form. A new supplier is saved as pending; it can be bought from only after approval, and
 * while every licence is in date (C-02).
 */
export default function AddSupplierDialog({ supplier, onClose }: { supplier?: Supplier; onClose: () => void }) {
  const queryClient = useQueryClient();
  const today = todayIST();
  const [form, setForm] = useState<Record<string, string>>(() => (supplier
    ? { name: supplier.name, gst_number: supplier.gst_number ?? '', state: supplier.state ?? '', city: supplier.city ?? '' }
    : ({} as Record<string, string>)));
  const [licences, setLicences] = useState<LicenceDraft[]>(() => {
    const checked = supplier?.licences.filter((l) => l.status === 'verified') ?? [];
    return checked.length ? checked.map(draftFromView) : [blankLicence('dl20b')];
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<string[]>([]);

  const save = useMutation({
    mutationFn: async (body: NewSupplier): Promise<unknown> => (supplier ? updateSupplier(supplier.id, body) : createSupplier(body)),
    onSuccess: () => {
      toast.success(supplier ? `${form.name} saved` : `${form.name} added — approve it to start buying`);
      queryClient.invalidateQueries({ queryKey: ['admin', 'vendors'] });
      queryClient.invalidateQueries({ queryKey: purchasingKeys.suppliers });
      onClose();
    },
    onError: (err) => {
      setFieldErrors(getApiFieldErrors(err));
      setErrors([getApiErrorMessage(err, 'Could not save the supplier')]);
    },
  });

  const submit = () => {
    const missing = FIELDS.filter((f) => f.required && !form[f.key]?.trim());
    const p = [
      ...(missing.length ? [`Required: ${missing.map((f) => f.label).join(', ')}`] : []),
      ...licenceProblems(licences, { party: 'supplier', today, requireValidUpto: true }),
    ];
    setErrors(p);
    if (p.length) return;
    const details = Object.fromEntries(FIELDS.map((f) => [f.key, f.key === 'gst_number' ? (form[f.key] ?? '').trim().toUpperCase() : (form[f.key] ?? '').trim()])
      .filter(([, v]) => v));
    save.mutate({ ...(details as unknown as NewSupplier), licences: licenceBodies(licences) });
  };

  return (
    <Modal title={supplier ? `Edit ${supplier.name}` : 'Add supplier'} onClose={onClose} size="xl">
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="block font-medium text-gray-700 mb-1">{f.label}{f.required && ' *'}</span>
            <input value={form[f.key] ?? ''} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
              placeholder={f.placeholder} className="input" />
            {fieldErrors[f.key] && <span className="text-xs text-red-500">{fieldErrors[f.key]}</span>}
          </label>
        ))}
      </div>
      <h3 className="mt-5 mb-1 text-sm font-semibold text-gray-900">Drug licences *</h3>
      <p className="text-xs text-gray-500 mb-2">
        Every licence the supplier holds, as printed: wholesale (Form 20B / 21B) for a distributor, manufacturing (Form 25 / 28) for a
        company, and any others. Purchases stop if any of them passes its valid-till date.
      </p>
      <div className="text-sm">
        <LicenceRowsEditor rows={licences} onChange={setLicences} today={today} showDetails idPrefix="supplier-licence"
          suggested={['dl20b', 'dl21b', 'dl25', 'dl28', 'dl25a', 'dl28a', 'dl25b']} />
      </div>
      {errors.length > 1 ? (
        <ul role="alert" className="mt-3 text-xs text-red-700 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
      ) : null}
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel={supplier ? 'Save supplier' : 'Add supplier'} pending={save.isPending}
        error={errors.length === 1 ? errors[0] : ''} />
    </Modal>
  );
}
