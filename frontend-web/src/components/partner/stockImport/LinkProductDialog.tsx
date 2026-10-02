'use client';
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { searchCatalogue } from '@/lib/partner/api';
import { linkImportRow, type ImportRow } from '@/lib/partner/stockImport';
import { scheduleBadge } from '@/lib/drugSchedule';
import { formatPrice } from '@/lib/utils';
import Modal from '@/components/admin/Modal';

interface Option { id: string; name: string; pack: string | null; schedule: string | null; mrp_paise: number; note?: string }

/**
 * Pick the Dawabag product this line is. Look-alike names are a safety risk, so the
 * partner checks name, strength and pack; the choice is remembered for later files.
 * Schedule X / NDPS products are never offered (C-10).
 */
export default function LinkProductDialog({ importId, row, onClose, onLinked }: {
  importId: string; row: ImportRow; onClose: () => void; onLinked: () => void;
}) {
  const [text, setText] = useState(row.parsed?.item_name?.split(/\s+/)[0] ?? '');
  const [q, setQ] = useState('');
  const results = useQuery({ queryKey: ['partner', 'catalogue', q], queryFn: () => searchCatalogue(q), enabled: q.length >= 2 });
  const link = useMutation({ mutationFn: (productId: string) => linkImportRow(importId, row.id, productId), onSuccess: onLinked });

  const search = (e: FormEvent) => {
    e.preventDefault();
    setQ(text.trim());
  };

  const options: Option[] = q
    ? (results.data ?? []).map((p) => ({ id: p.id, name: p.name, pack: null, schedule: p.drug_schedule, mrp_paise: p.mrp_paise,
        note: p.already_listed ? 'You list this' : undefined }))
    : row.candidates.map((c) => ({ ...c, note: c.listed ? 'You list this' : undefined }));

  return (
    <Modal title="Choose the Dawabag product" onClose={onClose} size="lg">
      <div className="space-y-3 text-sm">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="font-medium">{row.parsed?.item_name}</p>
          <p className="text-xs text-gray-500">
            {[row.parsed?.pack, row.parsed?.manufacturer, row.parsed?.mrp_paise != null ? `MRP ${formatPrice(row.parsed.mrp_paise)}` : null]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
          Check the medicine, strength and pack carefully — similar names can be different medicines.
        </p>
        <form onSubmit={search} className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} className="input" placeholder="Search the catalogue" aria-label="Search the catalogue" />
          <button type="submit" className="btn-outline text-sm inline-flex items-center gap-1"><Search className="w-4 h-4" /> Search</button>
        </form>
        <p className="text-xs text-gray-500">{q ? `Results for "${q}"` : 'Closest products in the catalogue'}</p>
        {results.isFetching && <Loader2 className="w-5 h-5 animate-spin text-gray-300" />}
        {!results.isFetching && options.length === 0 && (
          <p className="text-gray-500 text-xs">Nothing found. Search by the medicine name, or close this and request it as a new product.</p>
        )}
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {options.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{o.name}</p>
                <p className="text-xs text-gray-500">
                  {[o.pack, scheduleBadge(o.schedule), `MRP ${formatPrice(o.mrp_paise)}`, o.note].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button onClick={() => link.mutate(o.id)} disabled={link.isPending} className="btn-primary text-xs py-1.5 px-3">
                This one
              </button>
            </li>
          ))}
        </ul>
        {link.error && <p className="text-xs text-red-600">{getApiErrorMessage(link.error, 'Could not link the product')}</p>}
      </div>
    </Modal>
  );
}
