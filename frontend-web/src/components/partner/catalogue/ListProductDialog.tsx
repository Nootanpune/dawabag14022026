'use client';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createListing, partnerKeys } from '@/lib/partner/api';
import { scheduleBadge } from '@/lib/drugSchedule';
import { isScheduleH1, type CatalogueProduct, type NewListing } from '@/lib/partner/types';
import { getApiErrorMessage } from '@/lib/apiErrors';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import CataloguePrices from './CataloguePrices';
import H1DeclarationFields, { type H1Values } from './H1DeclarationFields';

export default function ListProductDialog({ product, onClose }: { product: CatalogueProduct; onClose: () => void }) {
  const queryClient = useQueryClient();
  const h1 = isScheduleH1(product.drug_schedule);
  const [sku, setSku] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [h1Values, setH1Values] = useState<H1Values>({ name: '', regNo: '', secureStorage: false });
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: (body: NewListing) => createListing(body),
    onSuccess: () => {
      toast.success(`${product.name} submitted for review`);
      onClose();
    },
    onError: (err) => setError(getApiErrorMessage(err, 'Could not list this product')),
    onSettled: () => queryClient.invalidateQueries({ queryKey: partnerKeys.all }),
  });

  const submit = () => {
    if (!accepted) return setError("Please agree to sell at Dawabag's catalogue price");
    if (h1 && (!h1Values.name.trim() || !h1Values.regNo.trim() || !h1Values.secureStorage)) {
      return setError('Schedule H1 needs the pharmacist name, registration number and storage declaration');
    }
    setError('');
    create.mutate({
      product_id: product.id,
      partner_sku: sku.trim() || undefined,
      catalogue_price_accepted: true,
      ...(h1 && {
        h1_pharmacist_name: h1Values.name.trim(),
        h1_pharmacist_reg_no: h1Values.regNo.trim(),
        h1_secure_storage_declared: true,
      }),
    });
  };

  return (
    <Modal title="List this product" onClose={onClose} size="lg">
      <p className="font-medium">{product.name}</p>
      <p className="text-xs text-gray-500 mb-3">
        {product.generic_name ?? ''} · {product.sku}
        {scheduleBadge(product.drug_schedule) ? ` · ${scheduleBadge(product.drug_schedule)}` : ''}
        {product.cold_chain ? ' · Cold chain' : ''}
      </p>
      <CataloguePrices product={product} />
      <div className="space-y-3 mt-3 text-sm">
        <label className="block">
          <span className="block font-medium text-gray-700 mb-1">
            Your SKU <span className="text-gray-400">(optional)</span>
          </span>
          <input value={sku} onChange={(e) => setSku(e.target.value)} maxLength={50} className="input" />
        </label>
        {h1 && <H1DeclarationFields value={h1Values} onChange={setH1Values} />}
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1" />
          <span>I agree to sell at Dawabag&apos;s catalogue price</span>
        </label>
      </div>
      <DialogActions
        onCancel={onClose}
        onConfirm={submit}
        confirmLabel="Submit for review"
        pending={create.isPending}
        error={error}
      />
    </Modal>
  );
}
