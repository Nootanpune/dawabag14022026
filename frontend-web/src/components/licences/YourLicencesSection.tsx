'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { fetchHolderLicences, licenceKeys, submitLicences, uploadLicenceDocument, type Holder } from '@/lib/licences/api';
import { blankLicence, licenceBodies, licenceProblems, type LicenceForm, type LicenceView, type Party } from '@/lib/licences/forms';
import { getApiErrorMessage } from '@/lib/apiErrors';
import { todayIST } from '@/lib/dates';
import LicenceList from './LicenceList';
import LicenceRowsEditor from './LicenceRowsEditor';
import LicenceDocumentButton from './LicenceDocumentButton';

interface Props {
  holder: Holder;
  party: Party;
  /** forms suggested first when adding (e.g. 20 / 21 for a retailer) */
  suggested?: LicenceForm[];
}

/** Attach a scan to a licence still waiting for the check (PDF, JPG or PNG, up to 5 MB). */
function UploadScan({ holder, licence }: { holder: Holder; licence: LicenceView }) {
  const qc = useQueryClient();
  const up = useMutation({
    mutationFn: (file: File) => uploadLicenceDocument(holder, licence.id!, file),
    onSuccess: () => { toast.success('Licence copy uploaded'); qc.invalidateQueries({ queryKey: licenceKeys.holder(holder) }); },
    onError: (err: any) => toast.error(err?.response?.status === 503 ? 'Uploads are not set up on this server yet' : getApiErrorMessage(err, 'Could not upload')),
  });
  return (
    <label className="text-xs font-medium text-brand-700 border border-brand-600 rounded-lg px-2 py-1 hover:bg-brand-50 inline-flex items-center gap-1 cursor-pointer">
      {up.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Upload className="w-3.5 h-3.5" aria-hidden="true" />}
      {licence.has_document ? 'Replace copy' : 'Upload copy'}
      <input type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only"
        aria-label={`Upload a copy of ${licence.label} ${licence.licence_number}`}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) up.mutate(f); e.target.value = ''; }} />
    </label>
  );
}

/**
 * "Your drug licences" for a partner pharmacy or a business / doctor account: every licence
 * with its valid-till date and status, and a form to send a renewed or an extra licence.
 * What is sent waits for Dawabag's check; a checked licence is never changed by its holder
 * (C-07, C-11, C-14, C-33). Nothing is kept on the device.
 */
export default function YourLicencesSection({ holder, party, suggested = [] }: Props) {
  const qc = useQueryClient();
  const today = todayIST();
  const { data, isLoading, error } = useQuery({ queryKey: licenceKeys.holder(holder), queryFn: () => fetchHolderLicences(holder) });
  const [adding, setAdding] = useState(false);
  const [rows, setRows] = useState(() => [blankLicence()]);
  const [problems, setProblems] = useState<string[]>([]);
  const send = useMutation({
    mutationFn: () => submitLicences(holder, licenceBodies(rows)),
    onSuccess: (r) => {
      toast.success(r.message);
      setAdding(false); setRows([blankLicence()]); setProblems([]);
      qc.invalidateQueries({ queryKey: licenceKeys.holder(holder) });
    },
    onError: (err) => setProblems([getApiErrorMessage(err, 'Could not send the licence')]),
  });
  const submit = () => {
    const p = licenceProblems(rows, { party, today, requireValidUpto: true, partial: true });
    setProblems(p);
    if (!p.length) send.mutate();
  };

  return (
    <section className="card text-sm" aria-labelledby={`${holder}-licences-title`}>
      <h2 id={`${holder}-licences-title`} className="text-base font-semibold text-gray-900">Your drug licences</h2>
      <p className="text-xs text-gray-500 mt-0.5">
        Every licence we hold for you. If any licence passes its valid-till date, {holder === 'partner' ? 'your listings stop selling' : 'trade orders pause'} until
        the renewed licence is checked — send it before then.
      </p>
      {isLoading && <p className="mt-3 text-gray-500">Loading…</p>}
      {error && <p className="mt-3 text-red-600">{getApiErrorMessage(error, 'Could not load your licences')}</p>}
      {data && (
        <>
          {!data.can_trade && data.problems.length > 0 && (
            <div role="alert" className="mt-3 text-red-800 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="font-medium">{holder === 'partner' ? 'Selling is paused' : 'Trade buying is paused'}</p>
              <ul className="list-disc pl-5 mt-1">{data.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
          {data.warnings.length > 0 && (
            <div className="mt-3 text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="font-medium">Renew soon</p>
              <ul className="list-disc pl-5 mt-1">{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          <div className="mt-3">
            <LicenceList licences={data.licences} label="Your drug licences"
              actions={(l) => l.id ? (
                <>
                  {l.has_document && <LicenceDocumentButton licenceId={l.id} where={holder} />}
                  {l.status === 'pending' && <UploadScan holder={holder} licence={l} />}
                </>
              ) : null} />
          </div>
        </>
      )}
      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} className="btn-outline text-sm mt-3">Send a renewed or another licence</button>
      ) : (
        <div className="mt-4 border-t border-gray-100 pt-3 space-y-3">
          <p className="font-medium">Send a renewed or another licence</p>
          <p className="text-xs text-gray-500">Choose the form as printed on the licence. After sending, upload a copy next to it in the list above.</p>
          <LicenceRowsEditor rows={rows} onChange={setRows} today={today} suggested={suggested} showDetails idPrefix={`${holder}-new`} />
          {problems.length > 0 && (
            <ul role="alert" className="text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 list-disc pl-6">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-outline text-sm" onClick={() => { setAdding(false); setProblems([]); }}>Cancel</button>
            <button type="button" className="btn-primary text-sm inline-flex items-center gap-2" disabled={send.isPending} onClick={submit}>
              {send.isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />} Send for checking
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
