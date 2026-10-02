'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { applyStockImport, type ApplyResult, type ImportSummary } from '@/lib/partner/stockImport';
import Modal from '@/components/admin/Modal';
import DialogActions from '@/components/admin/DialogActions';
import H1DeclarationFields, { type H1Values } from '@/components/partner/catalogue/H1DeclarationFields';

/** What Apply will do, and the declarations it needs (catalogue price C-16, cold storage C-25, Schedule H1). */
export default function ApplyDialog({ importId, summary, onClose, onApplied }: {
  importId: string; summary: ImportSummary; onClose: () => void; onApplied: (r: ApplyResult) => void;
}) {
  const [priceAccepted, setPriceAccepted] = useState(false);
  const [cold, setCold] = useState(false);
  const [h1, setH1] = useState<H1Values>({ name: '', regNo: '', secureStorage: false });
  const [error, setError] = useState('');
  const apply = useMutation({
    mutationFn: () => applyStockImport(importId, {
      catalogue_price_accepted: priceAccepted,
      cold_chain_confirmed: cold,
      ...(summary.h1_new_listings > 0 && h1.name && {
        h1_pharmacist_name: h1.name.trim(), h1_pharmacist_reg_no: h1.regNo.trim(), h1_secure_storage_declared: h1.secureStorage,
      }),
    }),
    onSuccess: onApplied,
    onError: (e) => setError(getApiErrorMessage(e, 'Could not apply the stock; nothing was changed')),
  });

  const confirm = () => {
    if (summary.new_listings > 0 && !priceAccepted) return setError('Accept Dawabag\'s catalogue price for the new listings, or they are left out');
    setError('');
    apply.mutate();
  };

  return (
    <Modal title="Apply this stock?" onClose={onClose} size="lg">
      <div className="space-y-3 text-sm text-gray-700">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>{summary.matched}</strong> lines ({summary.products} products, {summary.packs} packs) will set your stock on Dawabag, batch by batch.</li>
          <li>Your other batches of those products that are not in this file are set to 0 (or to what is already reserved for orders).</li>
          <li>Products not in this file are not changed. Dawabag&apos;s own stock and other pharmacies&apos; stock are never changed.</li>
          {summary.needs_review + summary.problem > 0 && (
            <li>{summary.needs_review + summary.problem} lines that need review or have problems are left out.</li>
          )}
        </ul>
        {summary.new_listings > 0 && (
          <label className="flex items-start gap-2 bg-gray-50 rounded-lg p-3">
            <input type="checkbox" checked={priceAccepted} onChange={(e) => setPriceAccepted(e.target.checked)} className="mt-0.5" />
            <span>
              {summary.new_listings} product{summary.new_listings === 1 ? ' is' : 's are'} new for you. I accept Dawabag&apos;s catalogue price for them.
              Dawabag reviews new listings before they are sold.
            </span>
          </label>
        )}
        {summary.cold_chain_products > 0 && (
          <label className="flex items-start gap-2 bg-blue-50 rounded-lg p-3">
            <input type="checkbox" checked={cold} onChange={(e) => setCold(e.target.checked)} className="mt-0.5" />
            <span>
              I confirm the {summary.cold_chain_products} refrigerated product{summary.cold_chain_products === 1 ? ' is' : 's are'} stored at 2–8 °C.
              Without this they are left out.
            </span>
          </label>
        )}
        {summary.h1_new_listings > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-gray-600">{summary.h1_new_listings} new Schedule H1 listing(s) need these details, or they are left out:</p>
            <H1DeclarationFields value={h1} onChange={setH1} />
          </div>
        )}
        <DialogActions onCancel={onClose} onConfirm={confirm} confirmLabel="Apply stock" pending={apply.isPending} error={error} />
      </div>
    </Modal>
  );
}
