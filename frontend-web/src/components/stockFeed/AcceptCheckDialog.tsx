'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { acceptCheck, KIND_HELP, type AcceptInput, type FeedCheck } from '@/lib/stockFeed';
import CheckDetails from './CheckDetails';

/**
 * The partner's person accepts one waiting item. New listings need the declarations a
 * person makes (catalogue price C-16, Schedule H1 pharmacist C-19, cold storage C-25);
 * refrigerated batches need the 2–8 °C confirmation; price / expiry changes a click.
 */
export default function AcceptCheckDialog({ check, onClose, onDone }: { check: FeedCheck; onClose: () => void; onDone: () => void }) {
  const [v, setV] = useState<AcceptInput>({});
  const save = useMutation({ mutationFn: () => acceptCheck(check.id, v), onSuccess: onDone });
  const listing = check.kind === 'new_listing';
  const cold = check.kind === 'cold_chain_batch' || (listing && check.product_cold_chain);
  const h1 = listing && check.product_schedule === 'Schedule H1';
  const tick = (k: keyof AcceptInput, label: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={!!v[k]} onChange={(e) => setV({ ...v, [k]: e.target.checked })} />
      <span>{label}</span>
    </label>
  );
  return (
    <Modal title={check.kind_label} onClose={onClose}>
      <div className="space-y-3">
        <CheckDetails c={check} />
        <p className="text-xs text-gray-600">{KIND_HELP[check.kind]}</p>
        {listing && tick('catalogue_price_accepted', 'I accept Dawabag\'s catalogue price for this product (C-16)')}
        {cold && tick('cold_chain_confirmed', 'This medicine is stored at 2–8 °C (C-25)')}
        {h1 && (
          <div className="space-y-2">
            <label className="block text-sm">Registered pharmacist&apos;s name
              <input className="input mt-1" value={v.h1_pharmacist_name ?? ''} onChange={(e) => setV({ ...v, h1_pharmacist_name: e.target.value })} />
            </label>
            <label className="block text-sm">Registration number
              <input className="input mt-1" value={v.h1_pharmacist_reg_no ?? ''} onChange={(e) => setV({ ...v, h1_pharmacist_reg_no: e.target.value })} />
            </label>
            {tick('h1_secure_storage_declared', 'Schedule H1 stock is kept in secure storage')}
          </div>
        )}
        {save.error && <p className="text-sm text-red-700" role="alert">{getApiErrorMessage(save.error, 'Could not save')}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-outline text-sm" onClick={onClose}>Cancel</button>
          <button type="button" className="btn-primary text-sm inline-flex items-center gap-2" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {listing ? 'List it' : 'Accept'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
