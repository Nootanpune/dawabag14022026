'use client';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import Modal from '@/components/admin/Modal';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { scheduleBadge } from '@/lib/drugSchedule';
import { searchCatalogue } from '@/lib/partner/api';
import { linkCheck, type FeedCheck } from '@/lib/stockFeed';
import { formatPrice } from '@/lib/utils';

/** "This item in my software is that Dawabag product" — remembered; the next snapshot applies it. */
export default function LinkFeedItemDialog({ check, onClose, onDone }: { check: FeedCheck; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState(check.item_name?.split(/\s+/)[0] ?? '');
  const [q, setQ] = useState(text);
  const results = useQuery({ queryKey: ['partner', 'catalogue', q], queryFn: () => searchCatalogue(q), enabled: q.length >= 2 });
  const link = useMutation({ mutationFn: (productId: string) => linkCheck(check.id, productId), onSuccess: onDone });
  const search = (e: FormEvent) => { e.preventDefault(); setQ(text.trim()); };
  return (
    <Modal title="Link to a Dawabag product" onClose={onClose} size="lg">
      <div className="space-y-3 text-sm">
        <p className="bg-gray-50 rounded-lg p-3 font-medium">{check.item_name}</p>
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2">
          Check the medicine, strength and pack carefully — similar names can be different medicines.
        </p>
        <form onSubmit={search} className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} className="input" aria-label="Search the catalogue" placeholder="Search the catalogue" />
          <button type="submit" className="btn-outline text-sm inline-flex items-center gap-1"><Search className="w-4 h-4" aria-hidden="true" /> Search</button>
        </form>
        {results.isFetching && <Loader2 className="w-5 h-5 animate-spin text-gray-300" />}
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {(results.data ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-gray-500">{[scheduleBadge(p.drug_schedule), `MRP ${formatPrice(p.mrp_paise)}`, p.already_listed ? 'You list this' : null].filter(Boolean).join(' · ')}</p>
              </div>
              <button type="button" onClick={() => link.mutate(p.id)} disabled={link.isPending} className="btn-primary text-xs py-1.5 px-3">This one</button>
            </li>
          ))}
        </ul>
        {link.error && <p className="text-xs text-red-700" role="alert">{getApiErrorMessage(link.error, 'Could not link the product')}</p>}
      </div>
    </Modal>
  );
}
