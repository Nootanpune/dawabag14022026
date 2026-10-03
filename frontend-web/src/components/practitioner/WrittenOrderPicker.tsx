'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSignature, Loader2, Upload } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { formatDateTimeIST } from '@/lib/dates';
import {
  fetchMyWrittenOrders, practitionerKeys, previewRequisition, signRequisition, uploadWrittenOrder, writtenOrderFileProblem,
} from '@/lib/practitioner/api';

interface Props {
  /** what the written order must cover (the cart, or what an order change adds) */
  items: { product_id: string; quantity: number }[];
  value: string | null;
  onChange: (id: string | null) => void;
}

/**
 * The doctor's / institution's signed written order (Sprint 44; Drugs Rules 1945 r.65(9)(b);
 * FDA Maharashtra circular Drug/Wholesalers Memo./16/2026/1). Either (a) upload the signed
 * requisition, or (b) sign the requisition for these medicines here: name as on the medical
 * council register, the declaration, and the account password re-entered now. The server keeps
 * it final once made; nothing is kept in the browser.
 */
export default function WrittenOrderPicker({ items, value, onChange }: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'sign' | 'upload'>('sign');
  const [typedName, setTypedName] = useState('');
  const [password, setPassword] = useState('');
  const [declared, setDeclared] = useState(false);
  const [fileError, setFileError] = useState('');
  const mine = useQuery({ queryKey: practitionerKeys.writtenOrders, queryFn: fetchMyWrittenOrders });
  const preview = useQuery({
    queryKey: ['practitioner', 'requisition-preview', items],
    queryFn: () => previewRequisition(items),
    enabled: mode === 'sign' && items.length > 0,
    retry: false,
  });
  const done = (id: string) => { onChange(id); queryClient.invalidateQueries({ queryKey: practitionerKeys.writtenOrders }); };
  const sign = useMutation({
    mutationFn: () => signRequisition({ items, typed_name: typedName, password, declaration: declared }),
    onSuccess: (r) => { setPassword(''); done(r.id); },
  });
  const upload = useMutation({ mutationFn: (f: File) => uploadWrittenOrder(f), onSuccess: (r) => done(r.id) });

  const chosen = (mine.data ?? []).find((w) => w.id === value);
  if (value) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm" data-testid="written-order-chosen">
        <p className="font-medium text-green-900 flex items-center gap-2"><FileSignature className="w-4 h-4" aria-hidden="true" /> Signed written order attached</p>
        <p className="text-xs text-green-900 mt-1">
          {chosen ? `${chosen.kind === 'upload' ? 'Uploaded requisition' : 'Signed in the app'}, ${formatDateTimeIST(chosen.signed_at)}` : 'Ready to go with this order.'}
        </p>
        <button type="button" className="text-xs text-brand-700 hover:underline mt-1" onClick={() => onChange(null)}>Use another</button>
      </div>
    );
  }
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3" aria-labelledby="wo-title">
      <div>
        <h3 id="wo-title" className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <FileSignature className="w-4 h-4 text-brand-700" aria-hidden="true" /> Signed written order needed
        </h3>
        <p className="text-xs text-gray-700 mt-1">
          Medicines are supplied to a doctor or medical institution only against a signed written order (Drugs Rules 1945, r.65(9)(b)).
        </p>
      </div>
      {(mine.data ?? []).length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-gray-800">Use one you made in the last 30 days</p>
          {(mine.data ?? []).map((w) => (
            <button key={w.id} type="button" onClick={() => onChange(w.id)}
              className="block w-full text-left text-xs bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-brand-600">
              {w.kind === 'upload' ? `Uploaded requisition${w.document_name ? ` (${w.document_name})` : ''}` : `Signed in the app (${(w.items ?? []).length} medicines)`}
              {' · '}{formatDateTimeIST(w.signed_at)}
            </button>
          ))}
        </div>
      )}
      <div role="tablist" className="flex gap-2 text-sm">
        <button type="button" role="tab" aria-selected={mode === 'sign'} onClick={() => setMode('sign')}
          className={mode === 'sign' ? 'btn-primary text-xs' : 'btn-outline text-xs'}>Sign here</button>
        <button type="button" role="tab" aria-selected={mode === 'upload'} onClick={() => setMode('upload')}
          className={mode === 'upload' ? 'btn-primary text-xs' : 'btn-outline text-xs'}>Upload signed requisition</button>
      </div>
      {mode === 'sign' ? (
        <div className="space-y-2">
          {preview.isLoading && <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Preparing the requisition…</p>}
          {preview.error && <p role="alert" className="text-xs text-red-700">{getApiErrorMessage(preview.error, 'Could not prepare the requisition')}</p>}
          {preview.data && (
            <pre className="whitespace-pre-wrap text-xs bg-white border border-gray-200 rounded-lg p-2 font-sans" data-testid="requisition-text">{preview.data.text}</pre>
          )}
          <label className="block text-xs">
            <span className="text-gray-700">Your name as on the medical council register{preview.data ? ` (${preview.data.name_as_per_register})` : ''}</span>
            <input className="input" value={typedName} onChange={(e) => setTypedName(e.target.value)} autoComplete="name" />
          </label>
          <label className="block text-xs">
            <span className="text-gray-700">Your Dawabag password (confirms it is you signing)</span>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="flex items-start gap-2 text-xs text-gray-800">
            <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.target.checked)} className="mt-0.5 accent-brand-600" />
            <span>I sign this written order for the medicines above, for use in my practice and not for resale.</span>
          </label>
          {sign.error && <p role="alert" className="text-xs text-red-700">{getApiErrorMessage(sign.error, 'The written order was not signed')}</p>}
          <button type="button" className="btn-primary text-sm" disabled={!declared || typedName.trim().length < 3 || !password || sign.isPending || !preview.data}
            onClick={() => sign.mutate()}>
            {sign.isPending && <Loader2 className="w-4 h-4 animate-spin inline mr-1" aria-hidden="true" />} Sign written order
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs">
            <span className="text-gray-700">Your signed requisition (PDF, or a photo — JPEG or PNG, up to 5 MB)</span>
            <input type="file" accept="application/pdf,image/jpeg,image/png" className="block mt-1 text-xs"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const p = writtenOrderFileProblem(f);
                setFileError(p ?? '');
                if (!p) upload.mutate(f);
              }} />
          </label>
          {upload.isPending && <p className="text-xs text-gray-500 flex items-center gap-1"><Upload className="w-3 h-3" aria-hidden="true" /> Uploading…</p>}
          {(fileError || upload.error) && <p role="alert" className="text-xs text-red-700">{fileError || getApiErrorMessage(upload.error, 'Upload failed')}</p>}
          <p className="text-xs text-gray-600">Our pharmacist checks that it is signed and lists these medicines before supplying them.</p>
        </div>
      )}
    </section>
  );
}
