'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { approveVendor, type PendingVendor, type VendorApproval, type VendorType } from '@/lib/admin/vendors';
import { DL_TYPE_LABELS } from '@/lib/admin/format';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '../Modal';

const VENDOR_TYPES: { value: VendorType; label: string }[] = [
  { value: 'supplier', label: 'Supplier' },
  { value: 'marketplace_partner', label: 'Marketplace partner' },
  { value: 'both', label: 'Both' },
];

export default function ApproveVendorDialog({ vendor, onClose }: { vendor: PendingVendor; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [dlType, setDlType] = useState<VendorApproval['drug_license_type'] | ''>('');
  const [expiry, setExpiry] = useState('');
  const [vendorType, setVendorType] = useState<VendorType>(
    (VENDOR_TYPES.find((t) => t.value === vendor.vendor_type)?.value ?? 'supplier') as VendorType
  );
  const [error, setError] = useState('');

  const approve = useMutation({
    mutationFn: (body: VendorApproval) => approveVendor(vendor.id, body),
    onSuccess: () => {
      toast.success(`${vendor.name} approved`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not approve vendor')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['admin', 'vendors'] }),
  });

  const submit = () => {
    if (!dlType || !expiry) return setError('Licence type and expiry date are required');
    setError('');
    approve.mutate({ drug_license_type: dlType, drug_license_expiry: expiry, vendor_type: vendorType });
  };

  return (
    <Modal title={`Approve ${vendor.name}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Drug licence type</span>
          <select value={dlType} onChange={(e) => setDlType(e.target.value as typeof dlType)} className="input">
            <option value="">Select</option>
            {Object.entries(DL_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Licence expiry</span>
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">Vendor type</span>
          <select value={vendorType} onChange={(e) => setVendorType(e.target.value as VendorType)} className="input">
            {VENDOR_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onClose} className="btn-outline text-sm">
          Cancel
        </button>
        <button onClick={submit} disabled={approve.isPending} className="btn-primary text-sm inline-flex items-center gap-2">
          {approve.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Approve
        </button>
      </div>
    </Modal>
  );
}
