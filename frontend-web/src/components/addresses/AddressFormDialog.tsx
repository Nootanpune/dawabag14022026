'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  addressErrors,
  ADDRESSES_QUERY_KEY,
  createAddress,
  updateAddress,
  type Address,
  type AddressInput,
} from '@/lib/addresses';
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';

const FIELDS: { key: keyof AddressInput; label: string; optional?: boolean; inputMode?: 'numeric' | 'tel' }[] = [
  { key: 'label', label: 'Label (Home, Clinic…)' },
  { key: 'full_name', label: 'Receiver name' },
  { key: 'mobile', label: 'Mobile', inputMode: 'tel' },
  { key: 'address_line1', label: 'House / building / street' },
  { key: 'address_line2', label: 'Area / landmark', optional: true },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'pincode', label: 'PIN code', inputMode: 'numeric' },
];

interface Props {
  address?: Address | null;
  onClose: () => void;
  onSaved?: (a: Address) => void;
}

/** Add or edit a saved address; the server validates again and may return a new row on edit. */
export default function AddressFormDialog({ address, onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const [v, setV] = useState<AddressInput>({
    label: address?.label ?? 'Home',
    full_name: address?.full_name ?? '',
    mobile: address?.mobile ?? '',
    address_line1: address?.address_line1 ?? '',
    address_line2: address?.address_line2 ?? '',
    city: address?.city ?? '',
    state: address?.state ?? '',
    pincode: address?.pincode ?? '',
    is_default: address?.is_default ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: (body: AddressInput) => (address ? updateAddress(address.id, body) : createAddress(body)),
    onSuccess: (a) => {
      toast.success(address ? 'Address updated' : 'Address added');
      onSaved?.(a);
      onClose();
    },
    onError: (err) => {
      setErrors(getApiFieldErrors(err));
      setError(getApiErrorMessage(err, 'Could not save the address'));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ADDRESSES_QUERY_KEY }),
  });

  const submit = () => {
    const body = { ...v, address_line2: v.address_line2?.trim() ? v.address_line2.trim() : null };
    const e = addressErrors(body);
    setErrors(e as Record<string, string>);
    if (Object.keys(e).length) return setError('Please fix the highlighted fields');
    setError('');
    save.mutate(body);
  };

  return (
    <Modal title={address ? 'Edit address' : 'Add address'} onClose={onClose} size="lg">
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        {FIELDS.map((f) => (
          <label key={f.key} className={f.key.startsWith('address_line') ? 'block sm:col-span-2' : 'block'}>
            <span className="block font-medium text-gray-700 mb-1">
              {f.label} {f.optional && <span className="text-gray-400 font-normal">(optional)</span>}
            </span>
            <input
              value={String(v[f.key] ?? '')}
              onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
              inputMode={f.inputMode}
              maxLength={f.key === 'pincode' ? 6 : f.key === 'mobile' ? 10 : 500}
              className="input"
            />
            {errors[f.key] && <span className="block text-xs text-red-500 mt-1">{errors[f.key]}</span>}
          </label>
        ))}
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" checked={!!v.is_default} onChange={(e) => setV({ ...v, is_default: e.target.checked })} />
          Make this my default address
        </label>
      </div>
      <DialogActions onCancel={onClose} onConfirm={submit} confirmLabel="Save address" pending={save.isPending} error={error} />
    </Modal>
  );
}
